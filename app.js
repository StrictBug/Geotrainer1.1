// Common utilities
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function isPointInPolygon(point, polygon) {
    const x = point.lat, y = point.lng;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;
        const intersect = ((yi > y) !== (yj > y)) &&
                          (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function distanceToSegment(point, polygon) {
    let minDistance = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        const lat1 = polygon[i].lat, lon1 = polygon[i].lng;
        const lat2 = polygon[j].lat, lon2 = polygon[j].lng;
        const dx = lon2 - lon1, dy = lat2 - lat1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        const t = Math.max(0, Math.min(1, ((point.lat - lat1) * dy + (point.lng - lon1) * dx) / (len * len)));
        const projLat = lat1 + t * dy;
        const projLon = lon1 + t * dx;
        const dist = haversineDistance(point.lat, point.lng, projLat, projLon);
        minDistance = Math.min(minDistance, dist);
    }
    return minDistance;
}

// Map and game state
let map, marker, actualLocationLayer, timerInterval;
const roundHistory = [];
const usedLocations = new Set();
let locations = [];

// Area settings
const areaSettings = {
    'VIC': { center: [-37.0, 144.0], zoom: 6 },
    'TAS': { center: [-42.0, 147.0], zoom: 7 },
    'NSW-E': { center: [-33.0, 150.0], zoom: 6 },
    'MAFC': { center: [-25.0, 135.0], zoom: 4 },
    'All regions': { center: [-25.0, 135.0], zoom: 4 }
};

// Initialize map
function initMap() {
    const urlParams = new URLSearchParams(window.location.search);
    const area = urlParams.get('area') || 'All regions';
    const { center, zoom } = areaSettings[area];
    map = L.map('map').setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
}

// Load locations from CSV
async function loadLocations() {
    const response = await fetch('locations.csv');
    const text = await response.text();
    const rows = text.split('\n').slice(1); // Skip header
    locations = rows.map(row => {
        const [name, area, point, lat1, long1, lat2, long2, lat3, long3, lat4, long4] = row.split(',');
        const coords = [
            { lat: parseFloat(lat1), lng: parseFloat(long1) },
            lat2 ? { lat: parseFloat(lat2), lng: parseFloat(long2) } : null,
            lat3 ? { lat: parseFloat(lat3), lng: parseFloat(long3) } : null,
            lat4 ? { lat: parseFloat(lat4), lng: parseFloat(long4) } : null
        ].filter(c => c !== null);
        return { name, area, point, lat1: parseFloat(lat1), long1: parseFloat(long1), coords };
    });
    const urlParams = new URLSearchParams(window.location.search);
    const area = urlParams.get('area') || 'All regions';
    if (area !== 'All regions') {
        locations = locations.filter(l => area === 'MAFC' ? ['VIC', 'TAS', 'SA', 'WA-S', 'NSW-W'].includes(l.area) : l.area === area);
    }
}

// Start new round
function startNewRound() {
    if (usedLocations.size >= locations.length) usedLocations.clear();
    const available = locations.filter(l => !usedLocations.has(l.name));
    const location = available[Math.floor(Math.random() * available.length)];
    usedLocations.add(location.name);
    document.getElementById('location').textContent = `Guess: ${location.name}`;
    document.getElementById('round').textContent = `Round: ${roundHistory.length + 1}/${new URLSearchParams(window.location.search).get('rounds')}`;
    document.getElementById('guessButton').disabled = true;
    document.getElementById('newRoundButton').disabled = true;
    document.getElementById('result').style.display = 'none';
    if (marker) map.removeLayer(marker);
    if (actualLocationLayer) map.removeLayer(actualLocationLayer);
    let timeLeft = 15;
    document.getElementById('timer').textContent = `Time left: ${timeLeft}s`;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = `Time left: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            endRound(location);
        }
    }, 1000);
    map.on('click', (e) => {
        if (marker) map.removeLayer(marker);
        marker = L.marker(e.latlng).addTo(map);
        document.getElementById('guessButton').disabled = false;
    });
    document.getElementById('guessButton').onclick = () => endRound(location);
    return location;
}

// End round
function endRound(location) {
    clearInterval(timerInterval);
    map.off('click');
    let distance = null;
    if (marker) {
        if (location.point === 'Y') {
            distance = haversineDistance(marker.getLatLng().lat, marker.getLatLng().lng, location.lat1, location.long1);
        } else {
            distance = isPointInPolygon(marker.getLatLng(), location.coords) ? 0 : distanceToSegment(marker.getLatLng(), location.coords);
        }
        distance = isNaN(distance) ? 95 : Math.round(distance * 10) / 10;
    }
    document.getElementById('result').style.display = 'block';
    document.getElementById('resultText').textContent = distance !== null ? `Distance: ${distance} km` : "Time's up! You didn’t guess.";
    if (location.point === 'Y') {
        actualLocationLayer = L.marker([location.lat1, location.long1], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(map);
        map.setView([location.lat1, location.long1], 7);
    } else {
        actualLocationLayer = L.polygon(location.coords, {
            color: '#00FF00',
            fillColor: '#00FF00',
            weight: 2,
            opacity: 0.8
        }).addTo(map);
        const centroid = location.coords.reduce((acc, c) => ({
            lat: acc.lat + c.lat / location.coords.length,
            lng: acc.lng + c.lng / location.coords.length
        }), { lat: 0, lng: 0 });
        map.setView([centroid.lat, centroid.lng], 7);
    }
    roundHistory.push({ location: location.name, distance });
    document.getElementById('newRoundButton').disabled = false;
    document.getElementById('newRoundButtonAfterResult').disabled = false;
    const rounds = parseInt(new URLSearchParams(window.location.search).get('rounds'));
    if (roundHistory.length >= rounds) {
        showGameOver();
    }
}

// Game over
function showGameOver() {
    document.getElementById('gameOver').style.display = 'block';
    const table = document.getElementById('resultsTable');
    roundHistory.forEach((r, i) => {
        const row = table.insertRow();
        row.insertCell().textContent = i + 1;
        row.insertCell().textContent = r.location;
        row.insertCell().textContent = r.distance !== null ? r.distance : 'N/A';
    });
    const avg = roundHistory.filter(r => r.distance !== null).reduce((sum, r) => sum + r.distance, 0) / roundHistory.filter(r => r.distance !== null).length;
    document.getElementById('averageDistance').textContent = `Average Distance: ${Math.round(avg * 10) / 10} km`;
    document.getElementById('playAgainButton').onclick = () => window.location.reload();
    document.getElementById('homeButton').onclick = () => window.location.href = 'index.html';
}

// Multiplayer logic
let socket, playerName, isHost;
if (window.location.pathname.includes('multiplayer.html')) {
    socket = io();
    const urlParams = new URLSearchParams(window.location.search);
    playerName = urlParams.get('playerName');
    isHost = urlParams.get('hostName') === playerName;
    socket.emit('rejoinGame', { gameCode: urlParams.get('gameCode'), playerName });

    socket.on('settingsUpdated', (settings) => {
        document.getElementById('round').textContent = `Round: ${settings.currentRound}/${settings.rounds}`;
        document.getElementById('players').textContent = `Players: ${settings.players.join(', ')}`;
    });

    socket.on('newRound', (location) => {
        document.getElementById('location').textContent = `Guess: ${location.name}`;
        document.getElementById('round').textContent = `Round: ${roundHistory.length + 1}/${urlParams.get('rounds')}`;
        document.getElementById('guessButton').disabled = true;
        document.getElementById('newRoundButton').disabled = !isHost;
        document.getElementById('result').style.display = 'none';
        if (marker) map.removeLayer(marker);
        if (actualLocationLayer) map.removeLayer(actualLocationLayer);
        let timeLeft = 15;
        document.getElementById('timer').textContent = `Time left: ${timeLeft}s`;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = `Time left: ${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                if (marker) socket.emit('submitGuess', { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng });
            }
        }, 1000);
        map.on('click', (e) => {
            if (marker) map.removeLayer(marker);
            marker = L.marker(e.latlng).addTo(map);
            document.getElementById('guessButton').disabled = false;
            socket.emit('rescindGuess');
        });
        document.getElementById('guessButton').onclick = () => {
            socket.emit('submitGuess', { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng });
        };
    });

    socket.on('roundResults', (data) => {
        clearInterval(timerInterval);
        map.off('click');
        document.getElementById('result').style.display = 'block';
        const myResult = data.players.find(p => p.name === playerName);
        document.getElementById('resultText').textContent = myResult.distance !== null
            ? `Distance: ${myResult.distance} km, Score: ${myResult.score}`
            : "You didn’t guess.";
        data.players.forEach(p => {
            if (p.guess) {
                L.marker([p.guess.lat, p.guess.lng], {
                    icon: L.divIcon({
                        className: 'player-marker',
                        html: p.name[0].toUpperCase(),
                        iconSize: [20, 20]
                    })
                }).addTo(map);
            }
        });
        if (data.actualLocation.point === 'Y') {
            actualLocationLayer = L.marker([data.actualLocation.lat1, data.actualLocation.long1], {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(map);
            map.setView([data.actualLocation.lat1, data.actualLocation.long1], 7);
        } else {
            actualLocationLayer = L.polygon(data.actualLocation.coords, {
                color: '#00FF00',
                fillColor: '#00FF00',
                weight: 2,
                opacity: 0.8
            }).addTo(map);
            const centroid = data.actualLocation.coords.reduce((acc, c) => ({
                lat: acc.lat + c.lat / data.actualLocation.coords.length,
                lng: acc.lng + c.lng / data.actualLocation.coords.length
            }), { lat: 0, lng: 0 });
            map.setView([centroid.lat, centroid.lng], 7);
        }
        document.getElementById('newRoundButton').disabled = !isHost;
    });

    socket.on('gameOver', (data) => {
        document.getElementById('gameOver').style.display = 'block';
        document.getElementById('playAgainButton').style.display = isHost ? 'block' : 'none';
        const table = document.getElementById('resultsTable');
        data.results.forEach((r, i) => {
            const row = table.insertRow();
            row.insertCell().textContent = i + 1;
            row.insertCell().textContent = r.location;
            row.insertCell().textContent = data.players.map(p => `${p.name}: ${r.scores[p.name] || 'N/A'}`).join(', ');
        });
        const winner = data.players.reduce((a, b) => (a.totalScore || 0) > (b.totalScore || 0) ? a : b);
        document.getElementById('winner').textContent = `Game over, ${winner.name} wins!`;
        document.getElementById('playAgainButton').onclick = () => socket.emit('restartGame');
        document.getElementById('homeButton').onclick = () => window.location.href = 'index.html';
    });
}

// Initialize game
document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await loadLocations();
    if (!window.location.pathname.includes('multiplayer.html')) {
        startNewRound();
        document.getElementById('newRoundButton').onclick = startNewRound;
        document.getElementById('newRoundButtonAfterResult').onclick = startNewRound;
    }
});