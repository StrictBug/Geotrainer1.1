let map;
let marker;
let actualMarkers = [];
let score = 0;
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
        case 'WA-S':
            return { center: { lat: -30.0, lng: 120.5 }, zoom: 5 };
        case 'SA':
            return { center: { lat: -31.0, lng: 135.5 }, zoom: 5 };
        case 'VIC':
            return { center: { lat: -37.0, lng: 144.0 }, zoom: 6 };
        case 'TAS':
            return { center: { lat: -42.0, lng: 146.0 }, zoom: 7 };
        case 'All regions':
        default:
            return { center: { lat: -25.2744, lng: 133.7751 }, zoom: 4 };
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
                const [name, lat, lng, area] = row.split(',');
                return {
                    name: name.trim(),
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    area: area.trim()
                };
            });
            if (selectedArea !== 'All regions') {
                locations = locations.filter(loc => loc.area === selectedArea);
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

function endRound() {
    let distance = 0;
    let points = 0;

    roundActive = false;

    if (!marker) {
        roundHistory.push({ location: actualLocation.name, distance: '-', points: 0 });
        document.getElementById("result").textContent = "Time's up! You didn’t guess. Score: 0 for this round.";
        round++;
        document.getElementById("newGame").disabled = false;
        if (round > maxRounds) {
            showGameOver();
        }
        return;
    }

    const guess = marker.getPosition();
    const actual = new google.maps.LatLng(actualLocation.lat, actualLocation.lng);
    
    if (!google.maps.geometry) {
        document.getElementById("result").textContent = "Error: Geometry library not loaded.";
        return;
    }

    distance = google.maps.geometry.spherical.computeDistanceBetween(guess, actual) / 1000;
    
    if (distance <= 5) {
        points = 1000;
    } else if (distance >= 100) {
        points = 0;
    } else {
        points = Math.floor(1000 - ((distance - 5) * (1000 / 95)));
    }
    score += points;

    roundHistory.push({ location: actualLocation.name, distance: distance.toFixed(1), points });

    document.getElementById("score").textContent = `Score: ${score}`;
    const actualMarker = new google.maps.Marker({
        position: actual,
        map: map,
        icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
    });
    actualMarkers.push(actualMarker);

    map.setCenter(actual);
    map.setZoom(8);
    document.getElementById("result").textContent = `Distance: ${distance.toFixed(1)} km | Points this round: ${points}`;
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
    html += '<table><tr><th>Round</th><th>Location</th><th>Distance (km)</th><th>Points</th></tr>';
    
    roundHistory.forEach((roundData, index) => {
        html += `<tr><td>${index + 1}</td><td>${roundData.location}</td><td>${roundData.distance}</td><td>${roundData.points}</td></tr>`;
    });

    const totalDistance = roundHistory.reduce((sum, round) => sum + (round.distance === '-' ? 0 : parseFloat(round.distance)), 0).toFixed(1);
    const totalPoints = roundHistory.reduce((sum, round) => sum + round.points, 0);
    html += `<tr class="total-row"><td colspan="2">Total</td><td>${totalDistance}</td><td>${totalPoints}</td></tr>`;
    html += '</table>';
    
    html += `
        <div class="button-container">
            <button id="playAgain">Play Again</button>
            <button id="backToHome">Back to Home</button>
        </div>
    `;

    summaryDiv.innerHTML = html;

    document.getElementById("playAgain").addEventListener("click", () => {
        score = 0;
        round = 1;
        usedLocations = [];
        roundHistory = [];
        actualMarkers.forEach(m => m.setMap(null));
        actualMarkers = [];
        document.getElementById("score").textContent = `Score: ${score}`;
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