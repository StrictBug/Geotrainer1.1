let map;
let marker;
let actualMarkers = [];
let timeLeft = 15;
let timer;
let locations = [];
let usedLocations = [];
let round = 1;
// let maxRounds = 15; // Removed duplicate declaration, now set below from URL
let roundHistory = [];
let roundActive = false;

const urlParams = new URLSearchParams(window.location.search);
let maxRounds = parseInt(urlParams.get('rounds')) || 15;
const selectedAreas = urlParams.get('areas') ? urlParams.get('areas').split(',') : ['All regions'];
const selectedLocationTypes = urlParams.get('locationTypes') ? urlParams.get('locationTypes').split(',') : ['all'];
let selectedRoundLength = 15;
if (urlParams.has('roundLength')) {
    const rl = parseInt(urlParams.get('roundLength'), 10);
    if ([5, 10, 15].includes(rl)) {
        selectedRoundLength = rl;
    }
}
console.log('window.location.search:', window.location.search);
console.log('URL roundLength param:', urlParams.get('roundLength'), 'parsed:', selectedRoundLength, 'type:', typeof selectedRoundLength);

function getAreaBounds(area) {
    // Define the bounds for each area
    const areaBounds = {
        'WA-S': { minLat: -35.0, maxLat: -25.0, minLng: 115.0, maxLng: 126.0 },
        'SA': { minLat: -38.0, maxLat: -26.0, minLng: 129.0, maxLng: 141.0 },
        'VIC': { minLat: -39.0, maxLat: -34.0, minLng: 141.0, maxLng: 150.0 },
        'TAS': { minLat: -43.5, maxLat: -40.5, minLng: 144.0, maxLng: 148.5 },
        'NSW-W': { minLat: -35.0, maxLat: -29.0, minLng: 141.0, maxLng: 147.0 },
        'NSW-E': { minLat: -37.0, maxLat: -28.0, minLng: 147.0, maxLng: 153.0 },
        'WA-N': { minLat: -23.0, maxLat: -14.0, minLng: 120.0, maxLng: 129.0 },
        'QLD-N': { minLat: -21.0, maxLat: -12.0, minLng: 138.0, maxLng: 147.0 },
        'QLD-S': { minLat: -29.0, maxLat: -23.0, minLng: 141.0, maxLng: 153.0 },
        'NT': { minLat: -26.0, maxLat: -11.0, minLng: 129.0, maxLng: 138.0 },
        'VAAC': { minLat: -17.727759, maxLat: 14.349548, minLng: 91.494141, maxLng: 166.816406 }
    };

    // Handle MAFC, BAFC and VAAC
    if (area === 'MAFC') {
        return getCombinedBounds(['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS']);
    } else if (area === 'BAFC') {
        return getCombinedBounds(['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E']);
    } else if (area === 'VAAC') {
        return areaBounds['VAAC'];
    } else if (area === 'All regions') {
        return {
            minLat: -44.0,
            maxLat: -10.0,
            minLng: 110.0,
            maxLng: 154.0
        };
    }

    return areaBounds[area];
}

function getCombinedBounds(areas) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    areas.forEach(area => {
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
    
    if (latSpan > 20 || lngSpan > 30) return 4;  // Very large area (e.g., multiple states)
    if (latSpan > 8 || lngSpan > 12) return 5;   // Large area (e.g., VIC+TAS)
    if (latSpan > 4 || lngSpan > 6) return 6;    // Medium area (e.g., single state)
    if (latSpan > 2 || lngSpan > 3) return 7;    // Small area
    return 8;  // Very small area
}

function getInitialMapSettings(areas) {
    // If it's a string, convert it to an array
    if (typeof areas === 'string') {
        areas = [areas];
    }

    // Default Australia-wide view settings
    const defaultView = { center: [-25.2744, 133.7751], zoom: 4 };

    // If no areas or All regions selected, return default view
    if (!areas || 
        areas.length === 0 || 
        areas.includes('All regions')) {
        return defaultView;
    }

    // If both MAFC and BAFC are selected, return default Australia-wide view
    if (areas.includes('MAFC') && areas.includes('BAFC')) {
        return defaultView;
    }

    // Special handling for VAAC combinations
    if (areas.includes('VAAC') && areas.length > 1) {
        // Use a wider view when VAAC is combined with other areas
        return { center: [-1.689, 129.155], zoom: 3 };
    }

    // Get combined bounds for all selected areas
    const bounds = getCombinedBounds(areas);
    
    // Calculate center point
    const center = [
        (bounds.minLat + bounds.maxLat) / 2,
        (bounds.minLng + bounds.maxLng) / 2
    ];

    // Calculate appropriate zoom level
    const zoom = calculateZoomLevel(bounds);

    return { center, zoom };
}

function calculateAreaBounds(polygons) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    polygons.forEach(polygon => {
        polygon.forEach(point => {
            if (!isNaN(point.lat) && !isNaN(point.lng)) {
                minLat = Math.min(minLat, point.lat);
                maxLat = Math.max(maxLat, point.lat);
                minLng = Math.min(minLng, point.lng);
                maxLng = Math.max(maxLng, point.lng);
            }
        });
    });

    return {
        minLat, maxLat, minLng, maxLng,
        latSpan: maxLat - minLat,
        lngSpan: maxLng - minLng
    };
}

function calculateAppropriateZoom(bounds) {
    // These values are tuned for Australian geography
    const LAT_THRESHOLD = 2; // Degrees of latitude span
    const LNG_THRESHOLD = 2; // Degrees of longitude span
    
    if (bounds.latSpan > LAT_THRESHOLD * 2 || bounds.lngSpan > LNG_THRESHOLD * 2) {
        return 6; // Large areas get zoom level 6
    } else if (bounds.latSpan > LAT_THRESHOLD || bounds.lngSpan > LNG_THRESHOLD) {
        return 7; // Medium areas get zoom level 7
    } else if (bounds.latSpan > LAT_THRESHOLD/2 || bounds.lngSpan > LNG_THRESHOLD/2) {
        return 8; // Small areas get zoom level 8
    }
    return 9; // Very small areas get zoom level 9
}

function calculatePolygonCentroid(vertices) {
    let latSum = 0;
    let lngSum = 0;
    let count = 0;

    vertices.forEach(v => {
        if (!isNaN(v.lat) && !isNaN(v.lng)) {
            latSum += v.lat;
            lngSum += v.lng;
            count++;
        }
    });

    if (count === 0) {
        console.warn('No valid vertices for centroid calculation');
        return null;
    }

    return [latSum / count, lngSum / count];
}

function loadLocations() {
    // Return the promise chain
    return Promise.all([
        fetch('points.csv').then(res => res.text()),
        fetch('areas.geojson').then(res => res.json())
    ]).then(([pointsText, areaGeojson]) => {
        const pointRows = pointsText.trim().split('\n').slice(1);
        const pointLocations = pointRows.map(row => {
            const [name, area, type, lat, lng] = row.split(',');
            return {
                type: 'point',
                name: name.trim(),
                area: area.trim(),
                pointType: type ? type.trim() : undefined,
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            };
        });
        const areaLocations = [];
        if (areaGeojson.features && Array.isArray(areaGeojson.features)) {
            areaGeojson.features.forEach(feature => {
                if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                    let parts = [];
                    let allCoords = [];
                    
                    if (feature.geometry.type === 'Polygon') {
                        // Single polygon case
                        const coords = feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
                        parts.push(coords);
                        allCoords = coords;
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        // Handle each polygon part separately
                        feature.geometry.coordinates.forEach(polygon => {
                            const coords = polygon[0].map(([lng, lat]) => ({ lat, lng }));
                            parts.push(coords);
                            allCoords.push(...coords);
                        });
                    }

                    // Use x_0 and y_0 from GeoJSON properties as centroid
                    const centroid = {
                        lat: feature.properties?.Y_0 || 0,
                        lng: feature.properties?.X_0 || 0
                    };
                    
                    areaLocations.push({
                        type: 'area',
                        name: feature.properties?.NAME || 'Unknown Area',
                        area: feature.properties?.AREA || feature.properties?.GAF_AREA || 'Unknown',
                        area2: feature.properties?.GAF_AREA2 || null,
                        areaType: feature.properties?.TYPE || 'Unknown',
                        areaType2: feature.properties?.TYPE2 || null,
                        polygon: parts[0], // Keep original polygon for compatibility
                        polygonParts: parts, // Store all parts for multi-polygon rendering
                        isMultiPolygon: feature.geometry.type === 'MultiPolygon',
                        centroid
                    });
                }
            });
        }
        locations = [...pointLocations, ...areaLocations];

        // Filter by selected areas
        if (!selectedAreas.includes('All regions')) {
            const mafcAreas = ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'];
            const bafcAreas = ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'];
            
            locations = locations.filter(loc => {
                return selectedAreas.some(area => {
                    if (area === 'MAFC') {
                        return mafcAreas.includes(loc.area) || (loc.area2 && mafcAreas.includes(loc.area2));
                    } else if (area === 'BAFC') {
                        return bafcAreas.includes(loc.area) || (loc.area2 && bafcAreas.includes(loc.area2));
                    } else {
                        return loc.area === area || loc.area2 === area;
                    }
                });
            });
        }

        // Filter by location types
        if (!selectedLocationTypes.includes('all')) {
            locations = locations.filter(loc => {
                return selectedLocationTypes.some(type => {
                    switch (type) {
                        case 'Forecast district':
                            return loc.type === 'area' && (loc.areaType === 'Forecast district' || loc.areaType2 === 'Forecast district');
                        case 'Geographical feature':
                            return (loc.type === 'area' && (loc.areaType === 'Geographical feature' || loc.areaType2 === 'Geographical feature')) ||
                                   (loc.type === 'point' && loc.pointType === 'Geographical feature');
                        case 'TAF':
                            return loc.type === 'point' && loc.pointType === 'TAF';
                        case 'Non TAF':
                            return loc.type === 'point' && (loc.pointType === null || loc.pointType === '' || loc.pointType !== 'TAF');
                        default:
                            return false;
                    }
                });
            });
        }

        if (locations.length === 0) {
            alert('No locations found for this area and type!');
            return;
        }
        startNewRound();
    }).catch(error => {
        console.error('Error loading locations:', error);
        alert('Failed to load locations. Check the console (F12) for details.');
    });
}

// Haversine distance calculation

// Haversine distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function distanceToSegment(point, v1, v2) {
    console.log('distanceToSegment called with:', {
        point: point ? { lat: point.lat, lng: point.lng } : null,
        v1: v1 ? { lat: v1.lat, lng: v1.lng } : null,
        v2: v2 ? { lat: v2.lat, lng: v2.lng } : null
    });

    if (!point || !v1 || !v2 || 
        isNaN(point.lat) || isNaN(point.lng) ||
        isNaN(v1.lat) || isNaN(v1.lng) || 
        isNaN(v2.lat) || isNaN(v2.lng)) {
        console.warn('Invalid coordinates in distanceToSegment, returning fallback');
        return 95;
    }

    if (v1.lat === v2.lat && v1.lng === v2.lng) {
        console.log('Degenerate segment, computing point-to-point distance');
        const dist = calculateDistance(point.lat, point.lng, v1.lat, v1.lng);
        console.log('Point-to-point distance:', dist);
        return dist;
    }

    const A = point.lat - v1.lat;
    const B = point.lng - v1.lng;
    const C = v2.lat - v1.lat;
    const D = v2.lng - v1.lng;

    console.log('Projection inputs:', { A, B, C, D });

    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) {
        const dot = A * C + B * D;
        param = dot / len_sq;
    }

    console.log('Projection param:', param);

    let xx, yy;
    if (param < 0 || len_sq === 0) {
        xx = v1.lat;
        yy = v1.lng;
    } else if (param > 1) {
        xx = v2.lat;
        yy = v2.lng;
    } else {
        xx = v1.lat + param * C;
        yy = v1.lng + param * D;
    }

    console.log('Closest point:', { xx, yy });

    if (isNaN(xx) || isNaN(yy)) {
        console.warn('Invalid closest point coordinates, returning fallback:', { xx, yy });
        return 95;
    }

    const distance = calculateDistance(point.lat, point.lng, xx, yy);

    console.log('Computed distance:', distance);

    if (isNaN(distance) || !isFinite(distance)) {
        console.warn('Invalid distance computed, returning fallback:', { xx, yy });
        return 95;
    }

    return distance;
}

// Point-in-polygon test using ray casting
function pointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        if (((vertices[i].lng > point.lng) !== (vertices[j].lng > point.lng)) &&
            (point.lat < (vertices[j].lat - vertices[i].lat) * (point.lng - vertices[i].lng) / (vertices[j].lng - vertices[i].lng) + vertices[i].lat)) {
            inside = !inside;
        }
    }
    return inside;
}

function startNewRound() {
    if (locations.length === 0) {
        document.getElementById("location").textContent = "Loading locations...";
        return;
    }

    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    clearInterval(timer);
    document.getElementById("result").textContent = "";
    document.getElementById("guess").style.display = "inline";
    document.getElementById("guess").disabled = true;
    document.getElementById("newGame").style.display = "inline";
    document.getElementById("newGame").disabled = true;
    document.getElementById("gameOver").classList.add("hidden");

    // Clear actual markers
    actualMarkers.forEach(m => {
        map.removeLayer(m);
    });
    actualMarkers = [];

    // Get map settings based on all selected areas
    const mapSettings = getInitialMapSettings(selectedAreas);
    map.setView(mapSettings.center, mapSettings.zoom);

    // Use a unique key for each location to track used ones
    function getLocationKey(loc) {
        if (loc.type === 'point') {
            return `point:${loc.name}:${loc.lat}:${loc.lng}`;
        } else if (loc.type === 'area') {
            return `area:${loc.name}:${loc.centroid.lat}:${loc.centroid.lng}`;
        }
        return JSON.stringify(loc);
    }
    let availableLocations = locations.filter(loc => !usedLocations.includes(getLocationKey(loc)));
    if (availableLocations.length === 0) {
        usedLocations = [];
        availableLocations = locations;
    }
    const randomIndex = Math.floor(Math.random() * availableLocations.length);
    actualLocation = availableLocations[randomIndex];
    usedLocations.push(getLocationKey(actualLocation));
    document.getElementById("location").textContent = `Guess: ${actualLocation.name}`;
    document.getElementById("round").textContent = `Round: ${round}/${maxRounds}`;

    console.log('Selected round length (startNewRound):', selectedRoundLength, 'type:', typeof selectedRoundLength);
    timeLeft = Number.isFinite(selectedRoundLength) && selectedRoundLength > 0 ? selectedRoundLength : 15;
    document.getElementById("timer").textContent = `Time left: ${timeLeft}s`;
    roundActive = true;

    timer = setInterval(() => {
        timeLeft--;
        document.getElementById("timer").textContent = `Time left: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timer);
            endRound();
        }
    }, 1000);
}

function endRound() {
    let distance = null;
    roundActive = false;

    // Clear existing markers
    actualMarkers.forEach(m => {
        map.removeLayer(m);
    });
    actualMarkers = [];

    if (actualLocation.type === 'point') {
        // Point location
        const actual = [actualLocation.lat, actualLocation.lng];
        const actualMarker = L.marker(actual, {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map);
        actualMarkers.push(actualMarker);
        map.setView(actual, 7);

        if (marker) {
            const guess = marker.getLatLng();
            console.log('Guess coordinates:', { lat: guess.lat, lng: guess.lng });
            distance = calculateDistance(guess.lat, guess.lng, actualLocation.lat, actualLocation.lng);
            console.log('Point location distance:', distance);
        }
    } else if (actualLocation.type === 'area') {
        // Area location
        const style = {
            color: '#00FF00',
            weight: 2,
            opacity: 1.0,
            fillColor: '#00FF00',
            fillOpacity: 0.3
        };

        // Use polygonParts if available (for multi-polygons), otherwise use single polygon
        const parts = actualLocation.isMultiPolygon ? actualLocation.polygonParts : [actualLocation.polygon];
        
        // Create a separate polygon for each part
        parts.forEach(polygonCoords => {
            const polygon = L.polygon(polygonCoords.map(v => [v.lat, v.lng]), style).addTo(map);
            actualMarkers.push(polygon);
        });

        // Calculate appropriate zoom level based on area size
        const bounds = calculateAreaBounds(parts);
        const zoomLevel = calculateAppropriateZoom(bounds);
        map.setView([actualLocation.centroid.lat, actualLocation.centroid.lng], zoomLevel);

        if (marker) {
            const guess = marker.getLatLng();
            const guessPoint = { lat: guess.lat, lng: guess.lng };
            
            // Check if point is inside any of the polygon parts
            const insideAny = parts.some(polygonCoords => pointInPolygon(guessPoint, polygonCoords));
            
            if (insideAny) {
                distance = 0;
                console.log('Guess inside polygon, distance: 0');
            } else {
                console.log('Calculating distance to polygon edges');
                const distances = [];
                
                // Calculate distances to all parts
                parts.forEach(polygonCoords => {
                    for (let i = 0; i < polygonCoords.length; i++) {
                        const j = (i + 1) % polygonCoords.length;
                        const dist = distanceToSegment(guessPoint, polygonCoords[i], polygonCoords[j]);
                        if (!isNaN(dist) && isFinite(dist)) {
                            distances.push(dist);
                        }
                    }
                });
                
                if (distances.length === 0) {
                    console.warn('No valid edge distances computed, defaulting to 95 km');
                    distance = 95;
                } else {
                    // Take the minimum distance to any part
                    distance = Math.min(...distances);
                }
                console.log('Selected distance:', distance);
            }
        }
    }

    roundHistory.push({ location: actualLocation.name, distance });

    document.getElementById("result").textContent = distance === null ? "Time's up! You didn't guess." : `Distance: ${distance === 0 ? '0' : distance.toFixed(1)} km`;
    document.getElementById("guess").disabled = true;
    if (round < maxRounds) {
        document.getElementById("newGame").disabled = false;
    } else {
        document.getElementById("newGame").disabled = true;
        document.getElementById("newGame").style.display = "none";
        document.getElementById("timer").textContent = "";
        document.getElementById("result").textContent = "Scoreboard showing in 5 seconds...";
    }
    round++;

    if (round > maxRounds) {
        setTimeout(() => {
            showGameOver();
        }, 5000);
    }
}

function showGameOver() {
    document.getElementById("location").textContent = "";
    document.getElementById("timer").textContent = "";
    document.getElementById("result").textContent = "";
    document.getElementById("newGame").style.display = "none";
    document.getElementById("guess").style.display = "none";
    document.getElementById("gameOver").classList.remove("hidden");

    const summaryDiv = document.getElementById("roundSummary");
    let html = '<h2>Game Over!</h2>';
    html += '<table><tr><th>Round</th><th>Location</th><th>Distance (km)</th></tr>';

    roundHistory.forEach((roundData, index) => {
        const distanceText = roundData.distance === null ? '-' : roundData.distance === 0 ? '0' : roundData.distance.toFixed(1);
        html += `<tr><td>${index + 1}</td><td>${roundData.location}</td><td>${distanceText}</td></tr>`;
    });

    const validDistances = roundHistory.filter(r => r.distance !== null).map(r => r.distance);
    const averageDistance = validDistances.length > 0 ? (validDistances.reduce((sum, d) => sum + d, 0) / validDistances.length).toFixed(1) : '-';
    html += `<tr class="total-row"><td colspan="2">Average</td><td>${averageDistance}</td></tr>`;
    html += '</table>';

    html += `
        <div class="button-container">
            <button id="playAgain">Play Again</button>
            <button id="backToHome">Back to Home</button>
        </div>
    `;

    summaryDiv.innerHTML = html;

    document.getElementById("playAgain").addEventListener("click", () => {
        round = 1;
        usedLocations = [];
        roundHistory = [];
        actualMarkers.forEach(m => {
            map.removeLayer(m);
        });
        actualMarkers = [];
        document.getElementById("gameOver").classList.add("hidden");
        startNewRound();
    });

    document.getElementById("backToHome").addEventListener("click", () => {
        window.location.href = 'index.html';
    });
}

document.getElementById("newGame").addEventListener("click", () => {
    if (!document.getElementById("newGame").disabled) {
        startNewRound();
    }
});

document.getElementById("guess").addEventListener("click", () => {
    if (timeLeft > 0 && !document.getElementById("guess").disabled) {
        clearInterval(timer);
        endRound();
    }
});

// Initialize map and game when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize the map if it hasn't been initialized yet
    if (!map) {
        // Initialize the map first with settings based on all selected areas
        const initialSettings = getInitialMapSettings(selectedAreas);
        map = L.map('map', { 
            minZoom: 3, 
            maxZoom: 9,
            tms: false,  // Set to false as these are not TMS tiles
            maxBounds: [[-52.354166667, 69.945833333], [23.700000000, 179.645833333]], // Exact tile coverage area
            maxBoundsViscosity: 1.0 // Prevent dragging outside bounds
        }).setView(initialSettings.center, initialSettings.zoom);
        
        L.tileLayer('/topo/tiles/{z}/{x}/{y}', {
            tms: false,  // Set to false as these are not TMS tiles
            minZoom: 3,
            maxZoom: 9,
            attribution: 'Custom topo tiles',
            bounds: [[-52.354166667, 69.945833333], [23.700000000, 179.645833333]], // Exact tile coverage area
            noWrap: true, // Prevent tile wrapping around the globe
            // Add error handling to debug tile loading issues
            onError: function(e) {
                console.error('Tile load error:', e);
                console.log('Failed tile URL:', e.target._url);
                console.log('Tile coords:', e.target.coords);
            },
            onTileLoad: function(e) {
                console.log('Tile loaded:', e.coords);
            },
            attribution: 'Map data &copy; Bureau of Meteorology'
        }).addTo(map);

        // Add click handler for map
        map.on('click', function(e) {
            if (!roundActive) return;
            
            if (marker) {
                map.removeLayer(marker);
            }
            marker = L.marker(e.latlng).addTo(map);
            document.getElementById('guess').disabled = false;
        });
    }

    // Load locations and start first round
    loadLocations().then(() => {
        if (locations.length > 0) {
            startNewRound();
        }
    }).catch(error => {
        console.error('Error loading locations:', error);
        alert('Failed to load locations. Please try again.');
    });
});