#!/usr/bin/env python3
"""
Build stylised white-isobar menu-bg.svg from live GFS mean sea-level pressure.

Usage:
  python3 scripts/build-gfs-mslp-bg.py

Requires: numpy, scikit-image, cfgrib, eccodes, xarray
Fetches NOAA GFS 0.25° PRMSL (NOMADS subset) over Australia; contours at 4 hPa.
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import xarray as xr
from skimage.filters import gaussian
from skimage.measure import find_contours

ROOT = Path(__file__).resolve().parents[1]
OUT_SVG = ROOT / "menu-bg.svg"
CACHE_DIR = ROOT / "assets" / "gfs-cache"
META_PATH = CACHE_DIR / "last-build.json"

# Australian synoptic frame
LON_MIN, LON_MAX = 105.0, 165.0
LAT_NORTH, LAT_SOUTH = -5.0, -50.0
VB_W, VB_H = 1600, 1000
STROKE = 10.0
CONTOUR_HPA = 4.0
# Soften GFS grid stair-steps before / after contouring
FIELD_SMOOTH_SIGMA = 1.8
PATH_SMOOTH_PASSES = 4
USER_AGENT = "Geotrainer/1.0 (MSLP menu background)"


def rdp(points: np.ndarray, epsilon: float) -> np.ndarray:
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    se = end - start
    se_len = float(np.linalg.norm(se))
    if se_len < 1e-9:
        dists = np.linalg.norm(points - start, axis=1)
    else:
        cross = (points[:, 0] - start[0]) * se[1] - (points[:, 1] - start[1]) * se[0]
        dists = np.abs(cross) / se_len
    i = int(np.argmax(dists))
    if float(dists[i]) > epsilon:
        left = rdp(points[: i + 1], epsilon)
        right = rdp(points[i:], epsilon)
        return np.vstack([left[:-1], right])
    return np.vstack([start, end])


def candidate_cycles(now: datetime | None = None) -> list[tuple[str, str]]:
    """Newest-first GFS cycles (YYYYMMDD, HH), lagging ~4h for product availability."""
    t = (now or datetime.now(timezone.utc)) - timedelta(hours=4)
    out: list[tuple[str, str]] = []
    for back in range(0, 48, 6):
        c = t - timedelta(hours=back)
        hour = (c.hour // 6) * 6
        c = c.replace(hour=hour, minute=0, second=0, microsecond=0)
        key = (c.strftime("%Y%m%d"), f"{hour:02d}")
        if key not in out:
            out.append(key)
    return out


def nomads_url(ymd: str, hh: str, fhour: int = 0) -> str:
    fff = f"{fhour:03d}"
    return (
        "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
        f"?file=gfs.t{hh}z.pgrb2.0p25.f{fff}"
        "&lev_mean_sea_level=on&var_PRMSL=on"
        f"&subregion=&leftlon={LON_MIN:.0f}&rightlon={LON_MAX:.0f}"
        f"&toplat={LAT_NORTH:.0f}&bottomlat={LAT_SOUTH:.0f}"
        f"&dir=%2Fgfs.{ymd}%2F{hh}%2Fatmos"
    )


def download_grib(url: str, dest: Path, timeout: int = 90) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    if len(data) < 1000 or not data.startswith(b"GRIB"):
        raise RuntimeError(f"Unexpected GRIB payload ({len(data)} bytes) from {url}")
    dest.write_bytes(data)


def fetch_gfs_prmsl() -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """
    Returns pressure_hPa[nlat, nlon] with lat north→south, lon west→east,
    plus latitude and longitude 1D arrays, and metadata.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None

    for ymd, hh in candidate_cycles():
        for fhour in (0, 3):
            url = nomads_url(ymd, hh, fhour)
            grib_path = CACHE_DIR / f"prmsl_{ymd}_{hh}_f{fhour:03d}.grib2"
            try:
                print(f"Fetching GFS PRMSL {ymd} {hh}Z f{fhour:03d} …", flush=True)
                download_grib(url, grib_path)
                ds = xr.open_dataset(
                    grib_path,
                    engine="cfgrib",
                    backend_kwargs={"indexpath": ""},
                )
                # Variable name is typically prmsl (Pa)
                var_name = "prmsl" if "prmsl" in ds else list(ds.data_vars)[0]
                da = ds[var_name]
                lats = np.asarray(da.latitude.values, dtype=float)
                lons = np.asarray(da.longitude.values, dtype=float)
                field = np.asarray(da.values, dtype=float)
                ds.close()

                # Ensure north→south rows for SVG (y increases southward)
                if lats[0] < lats[-1]:
                    lats = lats[::-1]
                    field = field[::-1, :]

                pressure_hpa = field / 100.0
                meta = {
                    "source": "NOMADS GFS 0.25° PRMSL",
                    "cycle": f"{ymd} {hh}Z",
                    "fhour": fhour,
                    "url": url,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "min_hpa": float(np.nanmin(pressure_hpa)),
                    "max_hpa": float(np.nanmax(pressure_hpa)),
                }
                print(
                    f"Loaded {pressure_hpa.shape[0]}×{pressure_hpa.shape[1]} "
                    f"({meta['min_hpa']:.1f}–{meta['max_hpa']:.1f} hPa)",
                    flush=True,
                )
                return pressure_hpa, lats, lons, meta
            except Exception as exc:  # noqa: BLE001 — try next cycle
                last_err = exc
                print(f"  failed: {exc}", flush=True)
                continue

    raise RuntimeError(f"Could not fetch GFS PRMSL: {last_err}")


def chaikin_smooth(pts: np.ndarray, closed: bool, passes: int = 2) -> np.ndarray:
    """Corner-cutting smoother — kills marching-squares jaggies without inventing loops."""
    out = pts
    for _ in range(passes):
        n = len(out)
        if n < 3:
            return out
        nxt: list[np.ndarray] = []
        if closed:
            for i in range(n - 1):  # last == first for closed rings from find_contours
                p, q = out[i], out[i + 1]
                nxt.append(0.75 * p + 0.25 * q)
                nxt.append(0.25 * p + 0.75 * q)
            nxt.append(nxt[0].copy())
        else:
            nxt.append(out[0])
            for i in range(n - 1):
                p, q = out[i], out[i + 1]
                nxt.append(0.75 * p + 0.25 * q)
                nxt.append(0.25 * p + 0.75 * q)
            nxt.append(out[-1])
        out = np.vstack(nxt)
    return out


def catmull_rom_to_bezier_d(pts: np.ndarray, closed: bool) -> str:
    """SVG cubic path through points (Catmull–Rom → Bezier)."""
    if len(pts) < 2:
        return f"M{pts[0, 0]:.2f} {pts[0, 1]:.2f}"
    if len(pts) == 2:
        return f"M{pts[0, 0]:.2f} {pts[0, 1]:.2f} L{pts[1, 0]:.2f} {pts[1, 1]:.2f}"

    work = pts[:-1] if closed and np.linalg.norm(pts[0] - pts[-1]) < 4.0 else pts
    n = len(work)
    cmds = [f"M{work[0, 0]:.2f} {work[0, 1]:.2f}"]

    def at(i: int) -> np.ndarray:
        if closed:
            return work[i % n]
        return work[max(0, min(n - 1, i))]

    count = n if closed else n - 1
    for i in range(count):
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        cmds.append(
            f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
        )
    if closed:
        cmds.append("Z")
    return " ".join(cmds)


def contours_to_paths(
    pressure_hpa: np.ndarray,
    lats: np.ndarray,
    lons: np.ndarray,
) -> list[np.ndarray]:
    """Marching-squares contours → smoothed SVG-space polylines."""
    # Blur the field slightly so contours follow continuous gradients, not grid facets
    field = gaussian(pressure_hpa, sigma=FIELD_SMOOTH_SIGMA, preserve_range=True)

    pmin = float(np.nanmin(field))
    pmax = float(np.nanmax(field))
    level0 = math.floor(pmin / CONTOUR_HPA) * CONTOUR_HPA
    level1 = math.ceil(pmax / CONTOUR_HPA) * CONTOUR_HPA
    levels = np.arange(level0, level1 + 0.1, CONTOUR_HPA)

    nlat, nlon = field.shape
    paths: list[np.ndarray] = []
    min_len = 28.0  # SVG units

    for level in levels:
        for contour in find_contours(field, float(level)):
            rows = contour[:, 0]
            cols = contour[:, 1]
            if len(rows) < 8:
                continue
            lat_vals = np.interp(rows, np.arange(nlat), lats)
            lon_vals = np.interp(cols, np.arange(nlon), lons)
            pts = np.column_stack(
                [
                    (lon_vals - LON_MIN) / (LON_MAX - LON_MIN) * VB_W,
                    (LAT_NORTH - lat_vals) / (LAT_NORTH - LAT_SOUTH) * VB_H,
                ]
            )
            closed = bool(np.linalg.norm(pts[0] - pts[-1]) < 4.0)
            # Light simplify first, then Chaikin so curves stay organic
            simp = rdp(pts, 1.35)
            if len(simp) < 4:
                continue
            smooth = chaikin_smooth(simp, closed=closed, passes=PATH_SMOOTH_PASSES)
            # Final light simplify so Bezier control stays compact
            smooth = rdp(smooth, 0.85)
            if len(smooth) < 4:
                continue
            length = float(np.linalg.norm(np.diff(smooth, axis=0), axis=1).sum())
            if length < min_len:
                continue
            paths.append(smooth)

    return paths


def path_to_d(pts: np.ndarray) -> str:
    closed = bool(np.linalg.norm(pts[0] - pts[-1]) < 4.0)
    return catmull_rom_to_bezier_d(pts, closed=closed)


def write_svg(paths: list[np.ndarray], meta: dict, out: Path) -> None:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} {VB_H}" '
        f'width="{VB_W}" height="{VB_H}" preserveAspectRatio="none" fill="none">',
        f'  <!-- GFS MSLP isobars: {meta.get("cycle", "?")} f{meta.get("fhour", 0):03d} '
        f'({meta.get("min_hpa", 0):.0f}–{meta.get("max_hpa", 0):.0f} hPa, {CONTOUR_HPA:.0f} hPa) -->',
        f'  <rect width="{VB_W}" height="{VB_H}" fill="#d9e3f0"/>',
        "  <defs>",
        '    <radialGradient id="wash" cx="52%" cy="42%" r="78%">',
        '      <stop offset="0%" stop-color="#e8eef6"/>',
        '      <stop offset="55%" stop-color="#d9e3f0"/>',
        '      <stop offset="100%" stop-color="#c8d5e6"/>',
        "    </radialGradient>",
        "  </defs>",
        f'  <rect width="{VB_W}" height="{VB_H}" fill="url(#wash)"/>',
        f'  <g stroke="#ffffff" stroke-width="{STROKE:.1f}" stroke-linecap="round" '
        f'stroke-linejoin="round" fill="none" shape-rendering="geometricPrecision">',
    ]
    for pts in paths:
        parts.append(f'    <path d="{path_to_d(pts)}"/>')
    parts.append("  </g>")
    parts.append("</svg>")

    # Atomic write so the server never serves a half-written file
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=out.parent,
        delete=False,
        suffix=".svg.tmp",
    ) as tmp:
        tmp.write("\n".join(parts) + "\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(out)

    META_PATH.write_text(json.dumps({**meta, "paths": len(paths)}, indent=2) + "\n")


def main() -> int:
    t0 = time.time()
    try:
        pressure, lats, lons, meta = fetch_gfs_prmsl()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    paths = contours_to_paths(pressure, lats, lons)
    if not paths:
        print("ERROR: no contour paths produced", file=sys.stderr)
        return 2

    write_svg(paths, meta, OUT_SVG)
    print(f"Wrote {OUT_SVG} with {len(paths)} isobar paths in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
