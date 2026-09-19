/**
 * Explore mode — browse filtered locations on the map with no timer or scoring.
 */
let map;
let featureLayer;
let contextLayer;
let allLocations = [];
let locations = [];
/** -1 means overview only (no individual location selected). */
let currentIndex = -1;
let dataLoaded = false;
/** True when the user zoomed into a location via the list or map. */
let locationFocused = false;

const urlParams = new URLSearchParams(window.location.search);
let selectedAreas = urlParams.get('areas') ? urlParams.get('areas').split(',') : ['All regions'];
/** Default: every layer on except forecast districts. */
const DEFAULT_EXPLORE_LOCATION_TYPES = [
    'Geographical feature',
    'Geographical feature points',
    'TAF',
    'Non TAF',
];
let selectedLocationTypes = urlParams.get('locationTypes')
    ? urlParams.get('locationTypes').split(',')
    : DEFAULT_EXPLORE_LOCATION_TYPES.slice();

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

/** Overview styles — light outline + mostly transparent fill. */
const contextForecastStyle = {
    color: '#6b8fd4',
    weight: 1.75,
    opacity: 0.78,
    fillColor: '#6b8fd4',
    fillOpacity: 0.12,
    className: 'explore-context-path',
    pane: 'exploreContextForecast',
};

/** Large base polygons drawn behind other geo areas (e.g. Eyre Peninsula). */
const contextBackgroundStyle = {
    color: '#6b8fd4',
    weight: 1.75,
    opacity: 0.78,
    fillColor: '#6b8fd4',
    fillOpacity: 0.12,
    className: 'explore-context-path',
    pane: 'exploreContextBackground',
};

const contextDesertStyle = {
    color: '#6b8fd4',
    weight: 1.75,
    opacity: 0.78,
    fillColor: '#6b8fd4',
    fillOpacity: 0.12,
    className: 'explore-context-path',
    pane: 'exploreContextDeserts',
};

const contextAreaStyle = {
    color: '#6b8fd4',
    weight: 1.75,
    opacity: 0.78,
    fillColor: '#6b8fd4',
    fillOpacity: 0.12,
    className: 'explore-context-path',
    pane: 'exploreContextAreas',
};

const contextAreaHoverStyle = {
    color: '#3b6ed8',
    weight: 3,
    opacity: 1,
    fillColor: '#3b6ed8',
    fillOpacity: 0.22,
};

const contextPointStyle = {
    radius: 5.5,
    color: '#4a72c9',
    weight: 1.5,
    opacity: 0.88,
    fillColor: '#6b8fd4',
    fillOpacity: 0.55,
    className: 'explore-context-path',
    pane: 'exploreContextPoints',
};

const contextPointHoverStyle = {
    radius: 8,
    color: '#2159d1',
    weight: 2.25,
    opacity: 1,
    fillColor: '#4d7ae0',
    fillOpacity: 0.88,
};

const focusAreaStyle = {
    ...areaStyle,
    pane: 'exploreFocus',
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

function fitToSelectedRegions() {
    if (!map) return;
    const settings = getInitialMapSettings(selectedAreas);
    map.setView([settings.center[0], settings.center[1]], settings.zoom);
}

function applyFilters() {
    locations = allLocations
        .filter((loc) => matchesAreaFilter(loc) && matchesTypeFilter(loc))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    locationFocused = false;
    fitToSelectedRegions();

    if (locations.length === 0) {
        clearFeature();
        clearContext();
        currentIndex = -1;
        document.getElementById('locationName').textContent = 'No locations found';
        document.getElementById('locationCounter').textContent = '0 / 0';
        document.getElementById('locationMeta').textContent = 'Try different filters';
        document.getElementById('exploreList').innerHTML = '';
        return locations;
    }

    const search = document.getElementById('exploreSearch');
    buildList(search ? search.value : '');
    clearIndividualSelection();
    rebuildContextLayer();
    return locations;
}

function readFiltersFromUi() {
    const areaBoxes = document.querySelectorAll('#ex-area input[type="checkbox"]:checked');
    const typeBoxes = document.querySelectorAll('#ex-locationType input[type="checkbox"]:checked');
    selectedAreas = Array.from(areaBoxes).map((cb) => cb.value);
    selectedLocationTypes = Array.from(typeBoxes).map((cb) => cb.value);
    if (!selectedAreas.length) selectedAreas = ['All regions'];
    if (!selectedLocationTypes.length) {
        selectedLocationTypes = DEFAULT_EXPLORE_LOCATION_TYPES.slice();
    }
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

function clearContext() {
    if (contextLayer) {
        map.removeLayer(contextLayer);
        contextLayer = null;
    }
}

function clearIndividualSelection() {
    locationFocused = false;
    currentIndex = -1;
    clearFeature();
    resetContextHoverStyles();
    const listedCount = getListedEntries().length;
    document.getElementById('locationName').textContent = 'All locations';
    document.getElementById('locationCounter').textContent =
        `${listedCount} shown`;
    document.getElementById('locationMeta').textContent =
        'Click map or list';
    highlightListItem(-1);
}

function resetContextHoverStyles() {
    if (!contextLayer) return;
    contextLayer.eachLayer((layer) => {
        const isPoint = typeof layer.getLatLng === 'function';
        let style = contextPointStyle;
        if (!isPoint) {
            let pane = layer.options && layer.options.pane;
            if (!pane && layer.eachLayer) {
                layer.eachLayer((child) => {
                    if (!pane && child.options) pane = child.options.pane;
                });
            }
            if (pane === 'exploreContextBackground') style = contextBackgroundStyle;
            else if (pane === 'exploreContextForecast') style = contextForecastStyle;
            else if (pane === 'exploreContextDeserts') style = contextDesertStyle;
            else style = contextAreaStyle;
        }
        setContextLayerStyle(layer, style);
        toggleContextHoverClass(layer, false);
    });
}

function setContextLayerStyle(layer, style) {
    if (layer.setStyle) {
        layer.setStyle(style);
    }
    if (layer.eachLayer) {
        layer.eachLayer((child) => {
            if (child.setStyle) child.setStyle(style);
        });
    }
}

function toggleContextHoverClass(layer, on) {
    const toggle = (pathLayer) => {
        const el = pathLayer.getElement && pathLayer.getElement();
        if (el) el.classList.toggle('explore-context-hover', on);
    };
    if (layer.eachLayer) {
        layer.eachLayer(toggle);
    } else {
        toggle(layer);
    }
}

function bringContextLayerForward(layer) {
    if (layer.bringToFront) {
        layer.bringToFront();
    } else if (layer.eachLayer) {
        layer.eachLayer((child) => {
            if (child.bringToFront) child.bringToFront();
        });
    }
    if (featureLayer) {
        featureLayer.bringToFront();
    }
}

function bindContextHover(layer, baseStyle, hoverStyle) {
    layer.on('mouseover', () => {
        setContextLayerStyle(layer, hoverStyle);
        toggleContextHoverClass(layer, true);
        bringContextLayerForward(layer);
    });
    layer.on('mouseout', () => {
        setContextLayerStyle(layer, baseStyle);
        toggleContextHoverClass(layer, false);
    });
}

function getSearchQuery() {
    const search = document.getElementById('exploreSearch');
    return search ? search.value.trim().toLowerCase() : '';
}

function locationMatchesSearch(loc, query = getSearchQuery()) {
    if (!query) return true;
    return loc.name.toLowerCase().includes(query);
}

function isForecastDistrict(loc) {
    return (
        loc.type !== 'point' &&
        (loc.areaType === 'Forecast district' || loc.areaType2 === 'Forecast district')
    );
}

function isBackgroundArea(loc) {
    return loc.type !== 'point' && /^Eyre Peninsula$/i.test((loc.name || '').trim());
}

function isDesert(loc) {
    return (
        loc.type !== 'point' &&
        !isForecastDistrict(loc) &&
        !isBackgroundArea(loc) &&
        /desert/i.test(loc.name || '')
    );
}

function contextStyleForArea(loc) {
    if (isBackgroundArea(loc)) return contextBackgroundStyle;
    if (isForecastDistrict(loc)) return contextForecastStyle;
    if (isDesert(loc)) return contextDesertStyle;
    return contextAreaStyle;
}

/** Locations currently shown in the left-hand list (area/type + search). */
function getListedEntries() {
    const query = getSearchQuery();
    const entries = [];
    locations.forEach((loc, index) => {
        if (locationMatchesSearch(loc, query)) {
            entries.push({ loc, index });
        }
    });
    return entries;
}

function rebuildContextLayer() {
    clearContext();
    const listed = getListedEntries();
    if (!map || !listed.length) {
        return;
    }

    const group = L.featureGroup();
    const backgroundAreas = listed.filter((entry) => isBackgroundArea(entry.loc));
    const forecastDistricts = listed.filter((entry) => isForecastDistrict(entry.loc));
    const deserts = listed.filter((entry) => isDesert(entry.loc));
    const otherAreas = listed.filter(
        (entry) =>
            entry.loc.type !== 'point' &&
            !isBackgroundArea(entry.loc) &&
            !isForecastDistrict(entry.loc) &&
            !isDesert(entry.loc)
    );
    const points = listed.filter((entry) => entry.loc.type === 'point');

    const addContextEntry = ({ loc, index }) => {
        let layer;
        if (loc.type === 'point') {
            layer = L.circleMarker([loc.lat, loc.lng], contextPointStyle);
            bindContextHover(layer, contextPointStyle, contextPointHoverStyle);
        } else {
            const baseStyle = contextStyleForArea(loc);
            const parts = loc.isMultiPolygon ? loc.polygonParts : [loc.polygon];
            const polygons = parts.map((polygonCoords) =>
                L.polygon(
                    polygonCoords.map((v) => [v.lat, v.lng]),
                    baseStyle
                )
            );
            layer = polygons.length === 1 ? polygons[0] : L.featureGroup(polygons);
            bindContextHover(layer, baseStyle, contextAreaHoverStyle);
        }
        layer.bindTooltip(loc.name, {
            sticky: true,
            direction: 'top',
            opacity: 0.92,
            className: 'explore-context-tooltip',
        });
        layer.on('click', () => toggleListFocus(index));
        layer.addTo(group);
    };

    // Bottom → top: background areas, forecast districts, deserts, other areas, points
    backgroundAreas.forEach(addContextEntry);
    forecastDistricts.forEach(addContextEntry);
    deserts.forEach(addContextEntry);
    otherAreas.forEach(addContextEntry);
    points.forEach(addContextEntry);

    group.addTo(map);
    contextLayer = group;
    if (featureLayer) {
        featureLayer.bringToFront();
    }
}

function zoomToLocation(loc, group) {
    if (loc.type === 'point') {
        map.setView([loc.lat, loc.lng], Math.min(7, Math.max(map.getZoom(), 6)));
        return;
    }

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
    const parts = loc.isMultiPolygon ? loc.polygonParts : [loc.polygon];
    const box = calculateAreaBounds(parts);
    map.setView(
        [loc.centroid.lat, loc.centroid.lng],
        Math.min(6, calculateAppropriateZoom(box))
    );
}

function drawLocation(loc, { zoomToFeature = false } = {}) {
    clearFeature();
    const group = L.featureGroup();
    const selectedIndex = currentIndex;

    if (loc.type === 'point') {
        L.marker([loc.lat, loc.lng], { icon: greenIcon, pane: 'exploreFocus' }).addTo(group);
    } else {
        const parts = loc.isMultiPolygon ? loc.polygonParts : [loc.polygon];
        parts.forEach((polygonCoords) => {
            L.polygon(
                polygonCoords.map((v) => [v.lat, v.lng]),
                focusAreaStyle
            ).addTo(group);
        });
    }

    const deselect = (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        if (currentIndex === selectedIndex && selectedIndex >= 0) {
            clearIndividualSelection();
            fitToSelectedRegions();
        }
    };
    group.eachLayer((layer) => {
        layer.on('click', deselect);
    });

    group.addTo(map);
    featureLayer = group;
    if (contextLayer) {
        featureLayer.bringToFront();
    }

    if (zoomToFeature) {
        zoomToLocation(loc, group);
    }
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

function showIndex(index, { zoomToFeature = false } = {}) {
    if (!locations.length) return;
    currentIndex = ((index % locations.length) + locations.length) % locations.length;
    const loc = locations[currentIndex];
    document.getElementById('locationName').textContent = loc.name;
    document.getElementById('locationCounter').textContent =
        `${currentIndex + 1} / ${locations.length}`;
    const gaf = formatGafAreas(loc);
    document.getElementById('locationMeta').textContent =
        `${typeLabel(loc)}${gaf ? ` · ${gaf}` : ''}`;
    drawLocation(loc, { zoomToFeature });
    highlightListItem(currentIndex);
}

/** Step through locations while preserving the current zoom mode. */
function stepIndex(delta) {
    if (!locations.length) return;
    const stayZoomedIn = locationFocused && currentIndex >= 0;

    if (currentIndex < 0) {
        // Overview: select next/prev at region zoom (do not zoom into the feature)
        showIndex(delta >= 0 ? 0 : locations.length - 1, { zoomToFeature: false });
        locationFocused = false;
        return;
    }

    showIndex(currentIndex + delta, { zoomToFeature: stayZoomedIn });
    locationFocused = stayZoomedIn;
}

function toggleListFocus(index) {
    if (!locations.length) return;
    if (currentIndex === index) {
        clearIndividualSelection();
        fitToSelectedRegions();
        return;
    }
    locationFocused = true;
    showIndex(index, { zoomToFeature: true });
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
        if (!locationMatchesSearch(loc, q)) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'explore-list-item' + (index === currentIndex ? ' active' : '');
        btn.dataset.index = String(index);
        btn.innerHTML = `<span class="explore-list-name">${escapeHtml(loc.name)}</span>` +
            `<span class="explore-list-type">${escapeHtml(typeLabel(loc))}</span>`;
        btn.addEventListener('click', () => toggleListFocus(index));
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

    // Background areas under forecast under deserts under other areas; points above; focus on top
    map.createPane('exploreContextBackground');
    map.getPane('exploreContextBackground').style.zIndex = 403;
    map.createPane('exploreContextForecast');
    map.getPane('exploreContextForecast').style.zIndex = 405;
    map.createPane('exploreContextDeserts');
    map.getPane('exploreContextDeserts').style.zIndex = 407;
    map.createPane('exploreContextAreas');
    map.getPane('exploreContextAreas').style.zIndex = 410;
    map.createPane('exploreContextPoints');
    map.getPane('exploreContextPoints').style.zIndex = 420;
    map.createPane('exploreFocus');
    map.getPane('exploreFocus').style.zIndex = 430;

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
        stepIndex(-1);
    });
    document.getElementById('nextLocation').addEventListener('click', () => {
        stepIndex(1);
    });
    document.getElementById('exploreSearch').addEventListener('input', (e) => {
        buildList(e.target.value);
        if (currentIndex < 0) {
            clearIndividualSelection();
        } else if (!locationMatchesSearch(locations[currentIndex])) {
            clearIndividualSelection();
        }
        rebuildContextLayer();
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
            stepIndex(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            stepIndex(1);
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
