let map;
let marker;
let actualMarkers = [];
let timeLeft = 15;
let timer;
let locations = [];
let usedLocations = [];
let round = 1;
let maxRounds = 15;
let roundHistory = [];
let roundActive = false;

const urlParams = new URLSearchParams(window.location.search);
maxRounds = parseInt(urlParams.get('rounds')) || 15;
const selectedArea = urlParams.get('area') || 'All regions';

function getInitialMapSettings(area) {
    switch (area) {
        case 'WA-S': return { center: [-30.0, 120.5], zoom: 5 };
        case 'SA': return { center: [-31.0, 135.5], zoom: 5 };
        case 'VIC': return { center: [-37.0, 144.0], zoom: 6 };
        case 'TAS': return { center: [-42.0, 146.0], zoom: 7 };
        case 'NSW-W': return { center: [-32.2, 144.86], zoom: 6 };
        case 'NSW-E': return { center: [-33.07, 150.37], zoom: 6 };
        case 'WA-N': return { center: [-20.31, 122.56], zoom: 5 };
        case 'QLD-N': return { center: [-18.59, 143.38], zoom: 5 };
        case 'QLD-S': return { center: [-26.05, 146.39], zoom: 6 };
        case 'NT': return { center: [-19.35, 133.70], zoom: 5 };
        case 'MAFC': return { center: [-32.2, 137.1], zoom: 4 };
        case 'BAFC': return { center: [-24.2, 137.1], zoom: 4 };
        case 'All regions':
        default: return { center: [-25.2744, 133.7751], zoom: 4 };
    }
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
    console.log('Fetching locations.csv...');
    fetch('locations.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('Could not load locations.csv');
            }
            console.log('locations.csv fetched successfully');
            return response.text();
        })
        .then(data => {
            const rows = data.trim().split('\n');
            const headers = rows[0].split(',');
            locations = rows.slice(1).map(row => {
                const cols = row.split(',');
                return {
                    name: cols[0].trim(),
                    area: cols[1].trim(),
                    point: cols[2].trim() === 'Y',
                    lat1: parseFloat(cols[3]),
                    long1: parseFloat(cols[4]),
                    lat2: cols[5] ? parseFloat(cols[5]) : null,
                    long2: cols[6] ? parseFloat(cols[6]) : null,
                    lat3: cols[7] ? parseFloat(cols[7]) : null,
                    long3: cols[8] ? parseFloat(cols[8]) : null,
                    lat4: cols[9] ? parseFloat(cols[9]) : null,
                    long4: cols[10] ? parseFloat(cols[10]) : null
                };
            });
            if (selectedArea !== 'All regions') {
                if (selectedArea === 'MAFC') {
                    locations = locations.filter(loc => 
                        ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'].includes(loc.area)
                    );
                } else if (selectedArea === 'BAFC') {
                    locations = locations.filter(loc => 
                        ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'].includes(loc.area)
                    );
                } else {
                    locations = locations.filter(loc => loc.area === selectedArea);
                }
            }
            if (locations.length === 0) {
                alert('No locations found for this area!');
                return;
            }
            startNewRound();
        })
        .catch(error => {
            console.error('Error loading CSV:', error);
            alert('Failed to load locations. Check the console (F12) for details.');
        });
}

function initMap() {
    console.log('initMap called');
    const mapSettings = getInitialMapSettings(selectedArea);
    
    // Initialize Leaflet map
    map = L.map('map', { minZoom: 4, maxZoom: 9 }).setView(mapSettings.center, mapSettings.zoom);
    
    // Add custom topographic tiles (EPSG:3857)
    L.tileLayer('/topo/tiles/{z}/{x}/{y}.png', {
        minZoom: 4,
        maxZoom: 9,
        noWrap: true,
        attribution: 'Custom topo tiles'
    }).addTo(map);
    
    console.log('Leaflet map initialized');

    // Add click listener
    map.on('click', (event) => {
        if (timeLeft > 0 && roundActive) {
            if (marker) {
                map.removeLayer(marker);
            }
            marker = L.marker([event.latlng.lat, event.latlng.lng]).addTo(map);
            document.getElementById("guess").disabled = false;
        }
    });

    loadLocations();
}

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

    const mapSettings = getInitialMapSettings(selectedArea);
    map.setView(mapSettings.center, mapSettings.zoom);

    let availableLocations = locations.filter(loc => !usedLocations.includes(loc));
    if (availableLocations.length === 0) {
        usedLocations = [];
        availableLocations = locations;
    }
    const randomIndex = Math.floor(Math.random() * availableLocations.length);
    actualLocation = availableLocations[randomIndex];
    usedLocations.push(actualLocation);
    document.getElementById("location").textContent = `Guess: ${actualLocation.name}`;
    document.getElementById("round").textContent = `Round: ${round}/${maxRounds}`;

    timeLeft = 15;
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

    if (actualLocation.point) {
        // Point location
        const actual = [actualLocation.lat1, actualLocation.long1];
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
            distance = calculateDistance(guess.lat, guess.lng, actualLocation.lat1, actualLocation.long1);
            console.log('Point location distance:', distance);
        }
    } else {
        // Polygon location
        const vertices = [
            { lat: actualLocation.lat1, lng: actualLocation.long1 },
            { lat: actualLocation.lat2, lng: actualLocation.long2 },
            { lat: actualLocation.lat3, lng: actualLocation.long3 }
        ];
        if (actualLocation.lat4 && actualLocation.long4 && !isNaN(actualLocation.lat4) && !isNaN(actualLocation.long4)) {
            vertices.push({ lat: actualLocation.lat4, lng: actualLocation.long4 });
        }

        console.log('Raw vertices:', vertices);

        const validVertices = vertices.filter(v => !isNaN(v.lat) && !isNaN(v.lng));
        console.log('Valid vertices:', validVertices);

        if (validVertices.length < 3) {
            console.error('Insufficient valid vertices for polygon:', validVertices);
            distance = 95;
            map.setView([actualLocation.lat1, actualLocation.long1], 7);
        } else {
            // Convert to Leaflet polygon format
            const polygonCoords = validVertices.map(v => [v.lat, v.lng]);
            const polygon = L.polygon(polygonCoords, {
                color: '#00FF00',
                weight: 2,
                opacity: 1.0,
                fillColor: '#00FF00',
                fillOpacity: 0.3
            }).addTo(map);
            actualMarkers.push(polygon);

            const centroid = calculatePolygonCentroid(validVertices);
            if (centroid) {
                map.setView(centroid, 7);
            } else {
                console.warn('Failed to calculate centroid, falling back to first vertex');
                map.setView([actualLocation.lat1, actualLocation.long1], 7);
            }

            if (marker) {
                const guess = marker.getLatLng();
                const guessPoint = { lat: guess.lat, lng: guess.lng };
                
                if (pointInPolygon(guessPoint, validVertices)) {
                    distance = 0;
                    console.log('Guess inside polygon, distance: 0');
                } else {
                    console.log('Calculating distance to polygon edges');
                    const distances = [];
                    for (let i = 0; i < validVertices.length; i++) {
                        const j = (i + 1) % validVertices.length;
                        console.log(`Computing distance to edge ${i}-${j}:`, {
                            v1: validVertices[i],
                            v2: validVertices[j]
                        });
                        const dist = distanceToSegment(guessPoint, validVertices[i], validVertices[j]);
                        console.log(`Edge ${i}-${j} distance:`, dist);
                        if (!isNaN(dist) && isFinite(dist)) {
                            distances.push(dist);
                        }
                    }

                    console.log('All edge distances:', distances);

                    if (distances.length === 0) {
                        console.warn('No valid edge distances computed, defaulting to 95 km');
                        distance = 95;
                    } else {
                        distance = Math.min(...distances);
                    }
                    console.log('Selected distance:', distance);
                }
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

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', initMap);