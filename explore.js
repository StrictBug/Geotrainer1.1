/**
 * Explore mode — browse filtered locations on the map with no timer or scoring.
 */
let map;
let featureLayer;
let allLocations = [];
let locations = [];
let currentIndex = 0;
let dataLoaded = false;

const urlParams = new URLSearchParams(window.location.search);
let selectedAreas = urlParams.get('areas') ? urlParams.get('areas').split(',') : ['All regions'];
let selectedLocationTypes = urlParams.get('locationTypes')
    ? urlParams.get('locationTypes').split(',')
    : ['all'];

const greenIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

const areaStyle = {
    color: '#2159d1',
    weight: 2,
    opacity: 1,
    fillColor: '#3b6ed8',
    fillOpacity: 0.28,
};

function getAreaBounds(area) {
    const areaBounds = {
        'WA-S': { minLat: -35.0, maxLat: -25.0, minLng: 115.0, maxLng: 126.0 },
        SA: { minLat: -38.0, maxLat: -26.0, minLng: 129.0, maxLng: 141.0 },
        VIC: { minLat: -39.0, maxLat: -34.0, minLng: 141.0, maxLng: 150.0 },
        TAS: { minLat: -43.5, maxLat: -40.5, minLng: 144.0, maxLng: 148.5 },
        'NSW-W': { minLat: -35.0, maxLat: -29.0, minLng: 141.0, maxLng: 147.0 },
        'NSW-E': { minLat: -37.0, maxLat: -28.0, minLng: 147.0, maxLng: 153.0 },
        'WA-N': { minLat: -23.0, maxLat: -14.0, minLng: 120.0, maxLng: 129.0 },
        'QLD-N': { minLat: -21.0, maxLat: -12.0, minLng: 138.0, maxLng: 147.0 },
        'QLD-S': { minLat: -29.0, maxLat: -23.0, minLng: 141.0, maxLng: 153.0 },
        NT: { minLat: -26.0, maxLat: -11.0, minLng: 129.0, maxLng: 138.0 },
        VAAC: { minLat: -17.727759, maxLat: 14.349548, minLng: 91.494141, maxLng: 166.816406 },
    };

    if (area === 'MAFC') {
        return getCombinedBounds(['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS']);
    }
    if (area === 'BAFC') {
        return getCombinedBounds(['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E']);
    }
    if (area === 'VAAC') {
        return areaBounds.VAAC;
    }
    if (area === 'All regions') {
        return { minLat: -44.0, maxLat: -10.0, minLng: 110.0, maxLng: 154.0 };
    }
    return areaBounds[area];
}

function getCombinedBounds(areas) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    areas.forEach((area) => {
        const bounds = getAreaBounds(area);
        if (bounds) {
            minLat = Math.min(minLat, bounds.minLat);
            maxLat = Math.max(maxLat, bounds.maxLat);
            minLng = Math.min(minLng, bounds.minLng);
            maxLng = Math.max(maxLng, bounds.maxLng);
        }
    });
    return { minLat, maxLat, minLng, maxLng };
}

function calculateZoomLevel(bounds) {
    const latSpan = bounds.maxLat - bounds.minLat;
    const lngSpan = bounds.maxLng - bounds.minLng;
    if (latSpan > 20 || lngSpan > 30) return 4;
    if (latSpan > 8 || lngSpan > 12) return 5;
    if (latSpan > 2 || lngSpan > 3) return 6;
    if (latSpan > 1 || lngSpan > 1.5) return 7;
    return 8;
}

function getInitialMapSettings(areas) {
    if (typeof areas === 'string') areas = [areas];
    const defaultView = { center: [-25.2744, 133.7751], zoom: 3 };
    if (!areas || areas.length === 0 || areas.includes('All regions')) {
        return defaultView;
    }
    if (areas.includes('MAFC') && areas.includes('BAFC')) {
        const bounds = getCombinedBounds([
            'WA-N', 'WA-S', 'SA', 'VIC', 'TAS', 'NSW-W', 'NSW-E', 'QLD-S', 'QLD-N', 'NT',
        ]);
        return {
            center: [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLng + bounds.maxLng) / 2],
            zoom: calculateZoomLevel(bounds),
        };
    }
    if (areas.includes('VAAC') && areas.length > 1) {
        return { center: [-10, 130], zoom: 3 };
    }
    const bounds = getCombinedBounds(areas);
    if (!bounds || !isFinite(bounds.minLat)) return defaultView;
    return {
        center: [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLng + bounds.maxLng) / 2],
        zoom: calculateZoomLevel(bounds),
    };
}

function calculateAreaBounds(polygons) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    polygons.forEach((polygon) => {
        polygon.forEach((point) => {
            if (!isNaN(point.lat) && !isNaN(point.lng)) {
                minLat = Math.min(minLat, point.lat);
                maxLat = Math.max(maxLat, point.lat);
                minLng = Math.min(minLng, point.lng);
                maxLng = Math.max(maxLng, point.lng);
            }
        });
    });
    return {
        minLat,
        maxLat,
        minLng,
        maxLng,
        latSpan: maxLat - minLat,
        lngSpan: maxLng - minLng,
    };
}

function calculateAppropriateZoom(bounds) {
    if (bounds.latSpan > 4 || bounds.lngSpan > 4) return 6;
    if (bounds.latSpan > 2 || bounds.lngSpan > 2) return 7;
    if (bounds.latSpan > 1 || bounds.lngSpan > 1) return 8;
    return 9;
}

function matchesAreaFilter(loc) {
    if (selectedAreas.includes('All regions')) return true;
    const mafcAreas = ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'];
    const bafcAreas = ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'];
    return selectedAreas.some((area) => {
        if (area === 'MAFC') {
            return mafcAreas.includes(loc.area) || (loc.area2 && mafcAreas.includes(loc.area2));
        }
        if (area === 'BAFC') {
            return bafcAreas.includes(loc.area) || (loc.area2 && bafcAreas.includes(loc.area2));
        }
        return loc.area === area || loc.area2 === area;
    });
}

function matchesTypeFilter(loc) {
    if (selectedLocationTypes.includes('all')) return true;
    return selectedLocationTypes.some((type) => {
        switch (type) {
            case 'Forecast district':
                return (
                    loc.type === 'area' &&
                    (loc.areaType === 'Forecast district' || loc.areaType2 === 'Forecast district')
                );
            case 'Geographical feature':
                return (
                    loc.type === 'area' &&
                    (loc.areaType === 'Geographical feature' ||
                        loc.areaType2 === 'Geographical feature' ||
                        loc.areaType === 'Geographical features')
                );
            case 'Geographical feature points':
                return loc.type === 'point' && loc.pointType === 'Geographical feature';
            case 'TAF':
                return loc.type === 'point' && loc.pointType === 'TAF';
            case 'Non TAF':
                return (
                    loc.type === 'point' &&
                    (loc.pointType === null ||
                        loc.pointType === '' ||
                        (loc.pointType !== 'TAF' && loc.pointType !== 'Geographical feature'))
                );
            default:
                return false;
        }
    });
}

function loadLocations() {
    if (dataLoaded && allLocations.length) {
        return Promise.resolve(applyFilters());
    }

    return Promise.all([
        fetch('points.csv').then((res) => res.text()),
        fetch('areas.geojson').then((res) => res.json()),
    ]).then(([pointsText, areaGeojson]) => {
        const pointRows = pointsText.trim().split('\n').slice(1);
        const pointLocations = pointRows.map((row) => {
            const [name, area, type, lat, lng] = row.split(',');
            return {
                type: 'point',
                name: name.trim(),
                area: area.trim(),
                pointType: type ? type.trim() : undefined,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
            };
        });

        const areaLocations = [];
        if (areaGeojson.features && Array.isArray(areaGeojson.features)) {
            areaGeojson.features.forEach((feature) => {
                if (
                    feature.geometry &&
                    (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
                ) {
                    const parts = [];
                    if (feature.geometry.type === 'Polygon') {
                        parts.push(feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng })));
                    } else {
                        feature.geometry.coordinates.forEach((polygon) => {
                            parts.push(polygon[0].map(([lng, lat]) => ({ lat, lng })));
                        });
                    }
                    areaLocations.push({
                        type: 'area',
                        name: feature.properties?.NAME || 'Unknown Area',
                        area: feature.properties?.AREA || feature.properties?.GAF_AREA || 'Unknown',
                        area2: feature.properties?.GAF_AREA2 || null,
                        areaType: feature.properties?.TYPE || 'Unknown',
                        areaType2: feature.properties?.TYPE2 || null,
                        polygon: parts[0],
                        polygonParts: parts,
                        isMultiPolygon: feature.geometry.type === 'MultiPolygon',
                        centroid: {
                            lat: feature.properties?.Y_0 || 0,
                            lng: feature.properties?.X_0 || 0,
                        },
                    });
                }
            });
        }

        allLocations = [...pointLocations, ...areaLocations];
        dataLoaded = true;
        return applyFilters();
    });
}

function applyFilters() {
    locations = allLocations
        .filter((loc) => matchesAreaFilter(loc) && matchesTypeFilter(loc))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    if (locations.length === 0) {
        clearFeature();
        document.getElementById('locationName').textContent = 'No locations found';
        document.getElementById('locationCounter').textContent = '0 / 0';
        document.getElementById('locationMeta').textContent = 'Try different filters';
        document.getElementById('exploreList').innerHTML = '';
        return locations;
    }

    const search = document.getElementById('exploreSearch');
    buildList(search ? search.value : '');
    showIndex(0);
    return locations;
}

function readFiltersFromUi() {
    const areaBoxes = document.querySelectorAll('#ex-area input[type="checkbox"]:checked');
    const typeBoxes = document.querySelectorAll('#ex-locationType input[type="checkbox"]:checked');
    selectedAreas = Array.from(areaBoxes).map((cb) => cb.value);
    selectedLocationTypes = Array.from(typeBoxes).map((cb) => cb.value);
    if (!selectedAreas.length) selectedAreas = ['All regions'];
    if (!selectedLocationTypes.length) selectedLocationTypes = ['all'];
}

function syncFiltersToUi() {
    const areaBoxes = document.querySelectorAll('#ex-area input[type="checkbox"]');
    const typeBoxes = document.querySelectorAll('#ex-locationType input[type="checkbox"]');

    areaBoxes.forEach((cb) => {
        cb.checked = selectedAreas.includes(cb.value);
        cb.disabled = false;
    });
    typeBoxes.forEach((cb) => {
        cb.checked = selectedLocationTypes.includes(cb.value);
        cb.disabled = false;
    });

    // Mirror MAFC/BAFC disable behaviour from checkbox-dropdown.js
    const mafcAreas = ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'];
    const bafcAreas = ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'];
    if (selectedAreas.includes('MAFC')) {
        areaBoxes.forEach((cb) => {
            if (mafcAreas.includes(cb.value)) {
                cb.checked = false;
                cb.disabled = true;
            }
        });
    }
    if (selectedAreas.includes('BAFC')) {
        areaBoxes.forEach((cb) => {
            if (bafcAreas.includes(cb.value)) {
                cb.checked = false;
                cb.disabled = true;
            }
        });
    }

    document.querySelectorAll('.checkbox-dropdown').forEach((dropdown) => {
        if (typeof updateSelectedOptions === 'function') {
            updateSelectedOptions(dropdown);
        }
    });
}

function syncFiltersToUrl() {
    const params = new URLSearchParams({
        areas: selectedAreas.join(','),
        locationTypes: selectedLocationTypes.join(','),
    });
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', next);
}

function clearFeature() {
    if (featureLayer) {
        map.removeLayer(featureLayer);
        featureLayer = null;
    }
}

function drawLocation(loc) {
    clearFeature();
    const group = L.featureGroup();

    if (loc.type === 'point') {
        L.marker([loc.lat, loc.lng], { icon: greenIcon }).addTo(group);
        group.addTo(map);
        featureLayer = group;
        map.setView([loc.lat, loc.lng], Math.min(7, Math.max(map.getZoom(), 6)));
        return;
    }

    const parts = loc.isMultiPolygon ? loc.polygonParts : [loc.polygon];
    parts.forEach((polygonCoords) => {
        L.polygon(
            polygonCoords.map((v) => [v.lat, v.lng]),
            areaStyle
        ).addTo(group);
    });
    group.addTo(map);
    featureLayer = group;

    try {
        const bounds = group.getBounds();
        if (bounds.isValid()) {
            // Extra pad so features like Pedirka aren't edge-to-edge in the viewport
            map.fitBounds(bounds.pad(0.55), {
                padding: [48, 48],
                maxZoom: 6,
            });
            return;
        }
    } catch (_) {
        /* fall through */
    }
    const box = calculateAreaBounds(parts);
    map.setView(
        [loc.centroid.lat, loc.centroid.lng],
        Math.min(6, calculateAppropriateZoom(box))
    );
}

function formatGafAreas(loc) {
    const areas = [loc.area, loc.area2].filter(
        (a) => a && a !== 'Unknown' && String(a).trim() !== ''
    );
    // Deduplicate while preserving order
    return [...new Set(areas.map((a) => String(a).trim()))].join(' · ');
}

function typeLabel(loc) {
    if (loc.type === 'point') {
        if (loc.pointType === 'TAF') return 'TAF point';
        if (loc.pointType === 'Geographical feature') return 'Geo. point';
        return 'Non TAF point';
    }
    return loc.areaType || 'Area';
}

function showIndex(index) {
    if (!locations.length) return;
    currentIndex = ((index % locations.length) + locations.length) % locations.length;
    const loc = locations[currentIndex];
    document.getElementById('locationName').textContent = loc.name;
    document.getElementById('locationCounter').textContent =
        `${currentIndex + 1} / ${locations.length}`;
    const gaf = formatGafAreas(loc);
    document.getElementById('locationMeta').textContent =
        `${typeLabel(loc)}${gaf ? ` · ${gaf}` : ''}`;
    drawLocation(loc);
    highlightListItem(currentIndex);
}

function highlightListItem(index) {
    const list = document.getElementById('exploreList');
    list.querySelectorAll('.explore-list-item').forEach((el) => {
        el.classList.toggle('active', Number(el.dataset.index) === index);
    });
    const active = list.querySelector('.explore-list-item.active');
    if (active) {
        active.scrollIntoView({ block: 'nearest' });
    }
}

function buildList(filterText = '') {
    const list = document.getElementById('exploreList');
    const q = filterText.trim().toLowerCase();
    list.innerHTML = '';
    locations.forEach((loc, index) => {
        if (q && !loc.name.toLowerCase().includes(q)) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'explore-list-item' + (index === currentIndex ? ' active' : '');
        btn.dataset.index = String(index);
        btn.innerHTML = `<span class="explore-list-name">${escapeHtml(loc.name)}</span>` +
            `<span class="explore-list-type">${escapeHtml(typeLabel(loc))}</span>`;
        btn.addEventListener('click', () => showIndex(index));
        list.appendChild(btn);
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function initMap() {
    const initialSettings = getInitialMapSettings(selectedAreas);
    map = L.map('map', {
        minZoom: 3,
        maxZoom: 9,
        tms: false,
        worldCopyJump: true,
        maxBounds: [
            [-55, 33.3],
            [25, 236.7],
        ],
        maxBoundsViscosity: 1.0,
    }).setView([initialSettings.center[0], initialSettings.center[1]], initialSettings.zoom);

    map.on('zoomend', function () {
        if (map.getZoom() === 3) {
            map.dragging.disable();
        } else {
            map.dragging.enable();
        }
    });

    L.tileLayer('/topo/tiles/{z}/{x}/{y}', {
        tms: false,
        minZoom: 3,
        maxZoom: 9,
        noWrap: false,
        attribution: 'Map data &copy; Bureau of Meteorology',
    }).addTo(map);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('backToMenu').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    document.getElementById('prevLocation').addEventListener('click', () => {
        showIndex(currentIndex - 1);
    });
    document.getElementById('nextLocation').addEventListener('click', () => {
        showIndex(currentIndex + 1);
    });
    document.getElementById('exploreSearch').addEventListener('input', (e) => {
        buildList(e.target.value);
    });

    // Apply filters when area / type checkboxes change
    document.querySelectorAll('#ex-area input, #ex-locationType input').forEach((input) => {
        input.addEventListener('click', () => {
            // Let checkbox-dropdown.js finish toggling first
            setTimeout(() => {
                readFiltersFromUi();
                syncFiltersToUrl();
                applyFilters();
                if (!locations.length) {
                    alert('No locations found for this area and type.');
                }
            }, 0);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            showIndex(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            showIndex(currentIndex + 1);
        }
    });

    syncFiltersToUi();
    initMap();
    loadLocations()
        .then(() => {
            if (!locations.length) {
                alert('No locations found for this area and type.');
            }
            setTimeout(() => map.invalidateSize(), 50);
        })
        .catch((err) => {
            console.error(err);
            document.getElementById('locationName').textContent = 'Failed to load';
            document.getElementById('locationCounter').textContent = '0 / 0';
            alert(err.message || 'Failed to load locations.');
        });
});
