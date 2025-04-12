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
        case 'WA-S': return { center: { lat: -30.0, lng: 120.5 }, zoom: 5 };
        case 'SA': return { center: { lat: -31.0, lng: 135.5 }, zoom: 5 };
        case 'VIC': return { center: { lat: -37.0, lng: 144.0 }, zoom: 6 };
        case 'TAS': return { center: { lat: -42.0, lng: 146.0 }, zoom: 7 };
        case 'NSW-W': return { center: { lat: -32.2, lng: 144.86 }, zoom: 6 };
        case 'NSW-E': return { center: { lat: -33.07, lng: 150.37 }, zoom: 6 };
        case 'WA-N': return { center: { lat: -20.31, lng: 122.56 }, zoom: 5 };
        case 'QLD-N': return { center: { lat: -18.59, lng: 143.38 }, zoom: 5 };
        case 'QLD-S': return { center: { lat: -26.05, lng: 146.39 }, zoom: 6 };
        case 'NT': return { center: { lat: -19.35, lng: 133.70 }, zoom: 5 };
        case 'MAFC': return { center: { lat: -32.2, lng: 137.1 }, zoom: 4 };
        case 'BAFC': return { center: { lat: -24.2, lng: 137.1 }, zoom: 4 };
        case 'All regions':
        default: return { center: { lat: -25.2744, lng: 133.7751 }, zoom: 4 };
    }
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
    map = new google.maps.Map(document.getElementById("map"), {
        center: mapSettings.center,
        zoom: mapSettings.zoom
    });
    console.log('Map initialized');
    console.log('Map object:', map);

    map.addListener("click", (event) => {
        if (timeLeft > 0 && roundActive) {
            if (marker) marker.setMap(null);
            marker = new google.maps.Marker({
                position: event.latLng,
                map: map
            });
            document.getElementById("guess").disabled = false;
        }
    });

    loadLocations();
}

function startNewRound() {
    if (locations.length === 0) {
        document.getElementById("location").textContent = "Loading locations...";
        return;
    }

    if (marker) marker.setMap(null);
    marker = null;
    clearInterval(timer);
    document.getElementById("result").textContent = "";
    document.getElementById("guess").style.display = "inline";
    document.getElementById("guess").disabled = true;
    document.getElementById("newGame").style.display = "inline";
    document.getElementById("newGame").disabled = true;
    document.getElementById("gameOver").classList.add("hidden");

    actualMarkers.forEach(m => {
        if (m.setMap) m.setMap(null);
        if (m.setPaths) m.setMap(null);
    });
    actualMarkers = [];

    const mapSettings = getInitialMapSettings(selectedArea);
    map.setCenter(mapSettings.center);
    map.setZoom(mapSettings.zoom);

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

function distanceToSegment(point, v1, v2) {
    console.log('distanceToSegment called with:', {
        point: point ? { lat: point.lat(), lng: point.lng() } : null,
        v1: v1 ? { lat: v1.lat(), lng: v1.lng() } : null,
        v2: v2 ? { lat: v2.lat(), lng: v2.lng() } : null
    });

    if (!point || !v1 || !v2 || 
        isNaN(point.lat()) || isNaN(point.lng()) ||
        isNaN(v1.lat()) || isNaN(v1.lng()) || 
        isNaN(v2.lat()) || isNaN(v2.lng())) {
        console.warn('Invalid coordinates in distanceToSegment, returning fallback');
        return 95;
    }

    if (v1.lat() === v2.lat() && v1.lng() === v2.lng()) {
        console.log('Degenerate segment, computing point-to-point distance');
        const dist = google.maps.geometry.spherical.computeDistanceBetween(point, v1) / 1000;
        console.log('Point-to-point distance:', dist);
        return dist;
    }

    const A = point.lat() - v1.lat();
    const B = point.lng() - v1.lng();
    const C = v2.lat() - v1.lat();
    const D = v2.lng() - v1.lng();

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
        xx = v1.lat();
        yy = v1.lng();
    } else if (param > 1) {
        xx = v2.lat();
        yy = v2.lng();
    } else {
        xx = v1.lat() + param * C;
        yy = v1.lng() + param * D;
    }

    console.log('Closest point:', { xx, yy });

    if (isNaN(xx) || isNaN(yy)) {
        console.warn('Invalid closest point coordinates, returning fallback:', { xx, yy });
        return 95;
    }

    const closestPoint = new google.maps.LatLng(xx, yy);
    const distance = google.maps.geometry.spherical.computeDistanceBetween(point, closestPoint) / 1000;

    console.log('Computed distance:', distance);

    if (isNaN(distance) || !isFinite(distance)) {
        console.warn('Invalid distance computed, returning fallback:', { xx, yy });
        return 95;
    }

    return distance;
}

function endRound() {
    let distance = null;

    roundActive = false;

    if (!marker) {
        roundHistory.push({ location: actualLocation.name, distance: null });
        document.getElementById("result").textContent = "Time's up! You didn’t guess.";
        round++;
        document.getElementById("newGame").disabled = false;
        if (round > maxRounds) {
            showGameOver();
        }
        return;
    }

    const guess = marker.getPosition();
    console.log('Guess coordinates:', { lat: guess.lat(), lng: guess.lng() });

    if (actualLocation.point) {
        const actual = new google.maps.LatLng(actualLocation.lat1, actualLocation.long1);
        distance = google.maps.geometry.spherical.computeDistanceBetween(guess, actual) / 1000;

        console.log('Point location distance:', distance);

        const actualMarker = new google.maps.Marker({
            position: actual,
            map: map,
            icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
        });
        actualMarkers.push(actualMarker);
        map.setCenter(actual);
    } else {
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
        } else {
            const polygon = new google.maps.Polygon({
                paths: validVertices,
                strokeColor: "#00FF00",
                strokeOpacity: 1.0,
                strokeWeight: 2,
                fillColor: "#00FF00",
                fillOpacity: 0.3
            });
            polygon.setMap(map);
            actualMarkers.push(polygon);

            if (google.maps.geometry.poly.containsLocation(guess, polygon)) {
                distance = 0;
                console.log('Guess inside polygon, distance: 0');
            } else {
                const v = validVertices.map(v => new google.maps.LatLng(v.lat, v.lng));
                console.log('LatLng vertices:', v.map(vv => ({ lat: vv.lat(), lng: vv.lng() })));
                const distances = [];
                for (let i = 0; i < v.length; i++) {
                    const j = (i + 1) % v.length;
                    console.log(`Computing distance to edge ${i}-${j}:`, {
                        v1: { lat: v[i].lat(), lng: v[i].lng() },
                        v2: { lat: v[j].lat(), lng: v[j].lng() }
                    });
                    const dist = distanceToSegment(guess, v[i], v[j]);
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

        map.setCenter({ lat: actualLocation.lat1, lng: actualLocation.long1 });
    }

    map.setZoom(8);
    roundHistory.push({ location: actualLocation.name, distance });

    document.getElementById("result").textContent = distance === null ? "No guess made." : `Distance: ${distance === 0 ? '0' : distance.toFixed(1)} km`;
    document.getElementById("guess").disabled = true;
    document.getElementById("newGame").disabled = false;
    round++;

    if (round > maxRounds) {
        showGameOver();
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
            if (m.setMap) m.setMap(null);
            if (m.setPaths) m.setMap(null);
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