const socket = io();
console.log('Connected to server');
let map;
let marker;
let timeLeft = 15;
let round = 1;
let maxRounds;
let selectedArea;
let gameCode;
let localPlayerName = '';
let roundActive = false;
let lastProcessedRound = 0;
let markers = [];
let isHost = false;
let gameTerminated = false;
let hostName = '';
let latestPin = null; // Tracks the latest pin location
let hasSubmittedGuess = false; // Tracks if a guess has been submitted in the current round

function showMainMenu() {
    if (gameCode) {
        if (isHost) {
            socket.emit('hostLeaveLobby', { gameCode });
        } else {
            socket.emit('leaveLobby', { gameCode });
        }
        gameCode = null;
    }
    document.getElementById('singlePlayerOptions').classList.add('hidden');
    document.getElementById('multiplayerOptions').classList.add('hidden');
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('hostForm').classList.add('hidden');
    document.getElementById('joinForm').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
}

function showSinglePlayer() {
    if (gameCode) {
        if (isHost) {
            socket.emit('hostLeaveLobby', { gameCode });
        } else {
            socket.emit('leaveLobby', { gameCode });
        }
        gameCode = null;
    }
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('singlePlayerOptions').classList.remove('hidden');
    document.getElementById('multiplayerOptions').classList.add('hidden');
    document.getElementById('lobby').classList.add('hidden');
}

function showMultiplayer() {
    if (gameCode) {
        if (isHost) {
            socket.emit('hostLeaveLobby', { gameCode });
        } else {
            socket.emit('leaveLobby', { gameCode });
        }
        gameCode = null;
    }
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('singlePlayerOptions').classList.add('hidden');
    document.getElementById('multiplayerOptions').classList.remove('hidden');
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('hostForm').classList.add('hidden');
    document.getElementById('joinForm').classList.add('hidden');
}

function startSinglePlayer() {
    const rounds = document.getElementById('sp-rounds').value;
    const area = document.getElementById('sp-area').value;
    const locationType = document.getElementById('sp-locationType').value;
    window.location.href = `game.html?rounds=${rounds}&area=${area}&locationType=${encodeURIComponent(locationType)}`;
}

function showHostForm() {
    document.getElementById('hostForm').classList.remove('hidden');
    document.getElementById('joinForm').classList.add('hidden');
}

function showJoinForm() {
    document.getElementById('joinForm').classList.remove('hidden');
    document.getElementById('hostForm').classList.add('hidden');
    document.getElementById('joinError').classList.add('hidden');
}

function hostMultiplayer() {
    const rounds = document.getElementById('mp-rounds').value;
    const area = document.getElementById('mp-area').value;
    const locationType = document.getElementById('mp-locationType').value;
    const roundLength = document.getElementById('mp-roundLength').value;
    const hostNameInput = document.getElementById('hostName').value.trim();
    if (hostNameInput) {
        localPlayerName = hostNameInput;
        hostName = hostNameInput;
        isHost = true;
        socket.emit('hostGame', { rounds: parseInt(rounds), area, locationType, roundLength: parseInt(roundLength), hostName: hostNameInput });
        showLobby();
        const playerList = document.getElementById('playerList');
        playerList.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = hostNameInput;
        playerList.appendChild(li);
        console.log('Host set: isHost =', isHost, 'localPlayerName =', localPlayerName, 'hostName =', hostName);
    }
}

function joinMultiplayer() {
    const gameCodeInput = document.getElementById('gameCode').value.toUpperCase();
    const playerName = document.getElementById('playerName').value.trim();
    if (gameCodeInput && playerName) {
        localPlayerName = playerName;
        isHost = false;
        gameCode = gameCodeInput;
        socket.emit('joinGame', { gameCode: gameCodeInput, playerName });
        console.log('Non-host set: isHost =', isHost, 'localPlayerName =', localPlayerName, 'hostName =', hostName);
    }
}

function showLobby() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('singlePlayerOptions').classList.add('hidden');
    document.getElementById('multiplayerOptions').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    const lobbyLeft = document.querySelector('.lobby-left');
    if (isHost) {
        document.getElementById('hostSettings').classList.remove('hidden');
        document.getElementById('startMultiplayer').classList.remove('hidden');
        lobbyLeft.classList.remove('non-host-lobby');
    } else {
        document.getElementById('hostSettings').classList.add('hidden');
        document.getElementById('startMultiplayer').classList.add('hidden');
        document.getElementById('nonHostSettings').classList.remove('hidden');
        lobbyLeft.classList.add('non-host-lobby');
    }
}

function updateGameSettings() {
    if (!isHost) return;
    const rounds = document.getElementById('mp-rounds').value;
    const area = document.getElementById('mp-area').value;
    const locationType = document.getElementById('mp-locationType').value;
    const roundLength = document.getElementById('mp-roundLength').value;
    socket.emit('updateSettings', { gameCode, rounds: parseInt(rounds), area, locationType, roundLength: parseInt(roundLength) });
}

socket.on('gameHosted', (code) => {
    gameCode = code;
    updateGameCodeDisplay(code);
});

socket.on('settingsUpdated', (settings) => {
    if (!isHost) {
        document.getElementById('nh-areaDisplay').textContent = settings.area;
        document.getElementById('nh-locationTypeDisplay').textContent = settings.locationType;
        document.getElementById('nh-roundsDisplay').textContent = settings.rounds;
    }
});

socket.on('playerList', (players) => {
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name || 'Unnamed Player';
        playerList.appendChild(li);
        if (!hostName && players.length > 0) {
            hostName = players[0].name;
            console.log('Set hostName from playerList:', hostName);
        }
    });
    if (!isHost && gameCode) {
        updateGameCodeDisplay(gameCode);
        showLobby();
        document.getElementById('joinError').classList.add('hidden');
    }
});

socket.on('settingsUpdated', ({ rounds, area, locationType, roundLength }) => {
    maxRounds = rounds;
    selectedArea = area;
    selectedLocationType = locationType || 'all';
    selectedRoundLength = roundLength || 15;
    const displayArea = area === 'All regions' ? 'All areas' : area;
    
    // Update displays if they exist (handles both game and lobby views)
    if (document.getElementById('nh-areaDisplay')) {
        document.getElementById('nh-areaDisplay').textContent = displayArea;
        document.getElementById('nh-roundsDisplay').textContent = rounds;
        document.getElementById('nh-locationTypeDisplay').textContent = selectedLocationType === 'all' ? 'All types' : selectedLocationType;
        document.getElementById('nh-roundLengthDisplay').textContent = roundLength + ' seconds';
    }
});

socket.on('updateGameCode', (code) => {
    updateGameCodeDisplay(code);
});

socket.on('error', (message) => {
    if (!document.getElementById('joinForm').classList.contains('hidden')) {
        document.getElementById('joinError').textContent = message;
        document.getElementById('joinError').classList.remove('hidden');
    } else {
        document.getElementById('errorMsg').textContent = message;
        document.getElementById('errorMsg').classList.remove('hidden');
    }
});

function startMultiplayerGame() {
    if (!isHost) return;
    socket.emit('startGame', gameCode);
}

socket.on('gameStarted', ({ rounds, area, locationType, players }) => {
    maxRounds = rounds;
    selectedArea = area;
    selectedLocationType = locationType;
    if (!hostName && players.length > 0) {
        hostName = players[0].name;
        console.log('Set hostName from gameStarted:', hostName);
    }
    window.location.href = `multiplayer.html?gameCode=${gameCode}&rounds=${rounds}&area=${area}&locationType=${locationType || 'all'}&playerName=${encodeURIComponent(localPlayerName)}&hostName=${encodeURIComponent(hostName)}`;
});

window.addEventListener('unload', () => {
    if (gameCode && !isHost && !gameTerminated) {
        socket.emit('playerLeaveGame', { gameCode });
    }
});

function updateGameCodeDisplay(code) {
    const lobbyCode = document.getElementById('lobbyCode');
    lobbyCode.textContent = `Game Code: ${code}`;
    const copyBtn = document.getElementById('copyCodeBtn');
    copyBtn.classList.remove('hidden');
    copyBtn.onclick = async () => {
        try {
            await navigator.clipboard.writeText(code);
            copyBtn.classList.add('copied');
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.textContent = 'Copy';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            copyBtn.textContent = 'Error';
            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
        }
    };
}

const urlParams = new URLSearchParams(window.location.search);
gameCode = urlParams.get('gameCode');
maxRounds = parseInt(urlParams.get('rounds')) || 15;
selectedArea = urlParams.get('area') || 'All regions';
selectedLocationType = urlParams.get('locationType') || 'all';
localPlayerName = decodeURIComponent(urlParams.get('playerName') || '');
hostName = decodeURIComponent(urlParams.get('hostName') || '');
isHost = localPlayerName === hostName;

console.log('Emitting rejoinGame', gameCode, localPlayerName);
console.log('Initial state: isHost =', isHost, 'localPlayerName =', localPlayerName, 'hostName =', hostName);
socket.emit('rejoinGame', { gameCode, playerName: localPlayerName });

socket.on('playerRejoined', ({ gameCode, playerName }) => {
    console.log(`Rejoined game ${gameCode} as ${playerName}, isHost: ${isHost}`);
});

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

// Haversine distance calculation
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
    
    if (bounds.latSpan > LAT_THRESHOLD || bounds.lngSpan > LNG_THRESHOLD) {
        return 6; // Larger areas get zoom level 6
    }
    return 7; // Smaller areas get zoom level 7
}

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

function initMap() {
    const mapSettings = getInitialMapSettings(selectedArea);
    
    // Initialize Leaflet map with constrained zoom matching local tiles
    map = L.map('map', { minZoom: 4, maxZoom: 9 }).setView(mapSettings.center, mapSettings.zoom);

    // Add custom topographic tiles (EPSG:3857)
    L.tileLayer('/topo/tiles/{z}/{x}/{y}.png', {
        minZoom: 4,
        maxZoom: 9,
        noWrap: true,
        attribution: 'Custom topo tiles'
    }).addTo(map);

    console.log('GameOver visibility at start:', document.getElementById('gameOver').classList.contains('hidden'));

    // Explicitly attach event listeners to buttons
    const guessButton = document.getElementById("guess");
    const newRoundButton = document.getElementById("newRound");
    if (guessButton) {
        guessButton.onclick = () => {
            console.log('Guess button clicked, latestPin:', latestPin ? { lat: latestPin.lat, lng: latestPin.lng } : null);
            submitGuess();
        };
        console.log('Guess button event listener attached');
    } else {
        console.error('Guess button not found in DOM');
    }
    if (newRoundButton) {
        newRoundButton.onclick = () => {
            console.log('New Round button clicked');
            startNewRound();
        };
        console.log('New Round button event listener attached');
    } else {
        console.error('New Round button not found in DOM');
    }

    // Add click listener for Leaflet
    map.on('click', (event) => {
        if (roundActive && timeLeft > 0) {
            if (marker) {
                map.removeLayer(marker);
            }
            marker = L.marker([event.latlng.lat, event.latlng.lng]).addTo(map);
            markers.push(marker);
            latestPin = { lat: event.latlng.lat, lng: event.latlng.lng }; // Update latest pin
            if (hasSubmittedGuess) {
                // Rescind previous guess if a new pin is placed
                socket.emit('rescindGuess', { gameCode, playerName: localPlayerName, round });
                hasSubmittedGuess = false;
                console.log('Rescinded previous guess due to new pin at:', event.latlng);
            }
            guessButton.disabled = false; // Enable Guess button
            console.log('Marker placed at:', event.latlng, 'Guess button state: disabled =', guessButton.disabled, 'timeLeft =', timeLeft, 'hasSubmittedGuess =', hasSubmittedGuess);
        }
    });
}

function clearMarkers() {
    markers.forEach(m => {
        map.removeLayer(m);
    });
    markers = [];
    marker = null;
    latestPin = null; // Clear latest pin
    hasSubmittedGuess = false; // Reset guess submission state
    console.log('Markers cleared, latestPin reset to null, hasSubmittedGuess reset to false');
}

socket.on('newRound', ({ round: newRound, maxRounds: newMaxRounds, location, timeLeft: serverTime }) => {
    console.log(`New round ${newRound} started: ${location}`);
    round = newRound;
    maxRounds = newMaxRounds;
    timeLeft = serverTime;
    roundActive = true;
    clearMarkers();
    document.getElementById("location").textContent = `Guess: ${location}`;
    document.getElementById("round").textContent = `Round: ${round}/${maxRounds}`;
    document.getElementById("timer").textContent = `Time left: ${timeLeft}s`;
    document.getElementById("guess").disabled = true;
    document.getElementById("guess").style.display = "";
    document.getElementById("newRound").style.display = "none";
    document.getElementById("result").textContent = "";
    map.setView(getInitialMapSettings(selectedArea).center, getInitialMapSettings(selectedArea).zoom);
    console.log('Guess button after newRound: display =', document.getElementById("guess").style.display || 'default', 'disabled =', document.getElementById("guess").disabled);
});

socket.on('timerUpdate', (newTime) => {
    timeLeft = newTime;
    document.getElementById("timer").textContent = `Time left: ${Math.max(0, timeLeft)}s`;
    if (timeLeft <= 0 && latestPin) {
        const guessData = { gameCode, guess: latestPin, playerName: localPlayerName, round };
        socket.emit('submitGuess', guessData);
        document.getElementById("guess").disabled = true;
        hasSubmittedGuess = true;
        console.log('Auto-submitted guess at timeLeft <= 0:', guessData);
    }
});

socket.on('roundResults', ({ round, location, results }) => {
    if (round <= lastProcessedRound) {
        console.log(`Ignoring duplicate round ${round} results for ${localPlayerName}`);
        return;
    }

    lastProcessedRound = round;
    console.log(`Received round ${round} results for ${localPlayerName}:`, results);
    console.log('isHost in roundResults:', isHost, 'localPlayerName =', localPlayerName, 'hostName =', hostName);
    roundActive = false;

    // Clear existing markers
    clearMarkers();

    if (location.type === 'point') {
        // Point location
        const actual = [location.lat, location.lng];
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
        markers.push(actualMarker);
        map.setView(actual, 7);
    } else if (location.type === 'area') {
        // Area location
        const style = {
            color: '#00FF00',
            weight: 2,
            opacity: 1.0,
            fillColor: '#00FF00',
            fillOpacity: 0.3
        };

        // Use polygonParts if available (for multi-polygons), otherwise use single polygon
        const parts = location.isMultiPolygon ? location.polygonParts : [location.polygon];
        
        // Create a separate polygon for each part
        parts.forEach(polygonCoords => {
            if (polygonCoords && polygonCoords.length >= 3) {
                const leafletCoords = polygonCoords.map(v => [v.lat, v.lng]);
                const polygon = L.polygon(leafletCoords, style).addTo(map);
                markers.push(polygon);
            }
        });

        // Calculate appropriate zoom level based on area size
        const bounds = calculateAreaBounds(parts);
        const zoomLevel = calculateAppropriateZoom(bounds);

        if (location.centroid && !isNaN(location.centroid.lat) && !isNaN(location.centroid.lng)) {
            map.setView([location.centroid.lat, location.centroid.lng], zoomLevel);
        } else if (parts[0] && parts[0].length > 0) {
            map.setView([parts[0][0].lat, parts[0][0].lng], zoomLevel);
        } else {
            console.error('Multiplayer: Invalid area coordinates:', parts);
            map.setView(getInitialMapSettings(selectedArea).center, getInitialMapSettings(selectedArea).zoom);
        }
    }

    // Sort results by score (highest to lowest)
    results.sort((a, b) => b.score - a.score);

    let resultText = '';
    results.forEach(r => {
        const distanceText = r.distance === null ? 'No guess' : r.distance === 0 ? '0 km' : r.distance.toFixed(1) + ' km';
        resultText += `<p class="score-line">${r.name}: ${r.score} points (${distanceText})</p>`;
        if (r.guess) {
            // Create player marker with first letter of name as label
            const playerMarker = L.marker([r.guess.lat, r.guess.lng], {
                icon: L.divIcon({
                    className: 'player-marker',
                    html: `<div style="background: #007cff; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${r.name[0]}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(map);
            markers.push(playerMarker);
            console.log(`Displayed marker for ${r.name} at:`, r.guess);
        }
    });
    document.getElementById("result").innerHTML = resultText;
    
    // Show "New Round" button only for host
    const newRoundButton = document.getElementById("newRound");
    newRoundButton.style.display = isHost ? "" : "none";
    newRoundButton.disabled = false;
    console.log('New Round button state:', {
        display: newRoundButton.style.display || 'default',
        disabled: newRoundButton.disabled,
        onclick: newRoundButton.onclick ? 'set' : 'not set'
    });
    console.log('Guess button state after roundResults:', {
        display: document.getElementById("guess").style.display || 'default',
        disabled: document.getElementById("guess").disabled,
        onclick: document.getElementById("guess").onclick ? 'set' : 'not set'
    });
});

socket.on('gameOver', ({ players, roundHistory }) => {
    console.log('GameOver received:', { players, roundHistory });
    roundActive = false;
    document.getElementById("location").textContent = "";
    document.getElementById("timer").textContent = "";
    document.getElementById("result").textContent = "Scoreboard showing in 5 seconds...";
    document.getElementById("guess").style.display = "none";
    document.getElementById("newRound").style.display = "none";
    // Delay showing the scoreboard by 5 seconds
    setTimeout(() => {
        document.getElementById("result").textContent = "";
        document.getElementById("gameOver").classList.remove("hidden");

        // Validate data and handle edge cases
        if (!players || !Array.isArray(players) || players.length === 0 || !roundHistory || !Array.isArray(roundHistory)) {
            console.error('Invalid gameOver data:', { players, roundHistory });
            document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: No valid game data available.</p>';
            return;
        }

        // Calculate total scores and find winner
        let scores;
        let winner;
        try {
            scores = players.map(p => {
                if (!p || !p.name) throw new Error('Invalid player data');
                const playerScores = roundHistory
                    .map(r => r.scores?.find(s => s?.name === p.name)?.score || 0);
                const total = playerScores.reduce((sum, s) => sum + s, 0);
                return {
                    name: p.name,
                    total
                };
            });

            if (scores.length === 0) throw new Error('No valid scores calculated');
            winner = scores.reduce((max, p) => (p.total > max.total ? p : max), scores[0]);
        } catch (error) {
            console.error('Error calculating scores:', error);
            document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: Unable to calculate scores.</p>';
            return;
        }

        // Build table HTML to match the desired layout
        let gameOverText = `<h3>Game over, ${winner.name} wins!</h3>`;
        gameOverText += '<table>';
        // First row: "Score" header spanning player columns
        gameOverText += `<tr><th class="no-border"></th><th class="no-border"></th><th colspan="${players.length}" class="distance-header">Score</th></tr>`;
        // Second row: "Round", "Location", and player names
        gameOverText += '<tr><th>Round</th><th>Location</th>';
        players.forEach(p => {
            gameOverText += `<th>${p.name || 'Unknown'}</th>`;
        });
        gameOverText += '</tr>';

        // Round rows
        roundHistory.forEach((round, index) => {
            if (!round || !round.location || !round.scores) {
                console.warn(`Invalid round data at index ${index}:`, round);
                return;
            }
            gameOverText += `<tr><td>${index + 1}</td><td>${round.location}</td>`;
            players.forEach(p => {
                const scoreData = round.scores.find(s => s?.name === p.name);
                const scoreText = scoreData ? scoreData.score : '0';
                gameOverText += `<td>${scoreText}</td>`;
            });
            gameOverText += '</tr>';
        });

        // Total row
        gameOverText += '<tr class="average-row"><td colspan="2" style="text-align: center;">Total</td>';
        scores.forEach(p => {
            gameOverText += `<td>${p.total}</td>`;
        });
        gameOverText += '</tr>';

        gameOverText += '</table>';

        console.log('GameOver HTML:', gameOverText);
        try {
            document.getElementById("roundSummary").innerHTML = gameOverText;

            // Attach event listeners to buttons
            const playAgainButton = document.getElementById("playAgain");
            const backToHomeButton = document.getElementById("backToHome");
            playAgainButton.style.display = isHost ? "" : "none"; // Only host can restart
            playAgainButton.onclick = restartGame;
            backToHomeButton.onclick = returnToMenu;
        } catch (error) {
            console.error('Error setting roundSummary:', error);
            document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: Unable to display results.</p>';
        }
    }, 5000);

    // Validate data and handle edge cases
    if (!players || !Array.isArray(players) || players.length === 0 || !roundHistory || !Array.isArray(roundHistory)) {
        console.error('Invalid gameOver data:', { players, roundHistory });
        document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: No valid game data available.</p>';
        return;
    }

    // Calculate total scores and find winner
    let scores;
    let winner;
    try {
        scores = players.map(p => {
            if (!p || !p.name) throw new Error('Invalid player data');
            const playerScores = roundHistory
                .map(r => r.scores?.find(s => s?.name === p.name)?.score || 0);
            const total = playerScores.reduce((sum, s) => sum + s, 0);
            return {
                name: p.name,
                total
            };
        });

        if (scores.length === 0) throw new Error('No valid scores calculated');
        winner = scores.reduce((max, p) => (p.total > max.total ? p : max), scores[0]);
    } catch (error) {
        console.error('Error calculating scores:', error);
        document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: Unable to calculate scores.</p>';
        return;
    }

    // Build table HTML to match the desired layout
    let gameOverText = `<h3>Game over, ${winner.name} wins!</h3>`;
    gameOverText += '<table>';
    // First row: "Score" header spanning player columns
    gameOverText += `<tr><th class="no-border"></th><th class="no-border"></th><th colspan="${players.length}" class="distance-header">Score</th></tr>`;
    // Second row: "Round", "Location", and player names
    gameOverText += '<tr><th>Round</th><th>Location</th>';
    players.forEach(p => {
        gameOverText += `<th>${p.name || 'Unknown'}</th>`;
    });
    gameOverText += '</tr>';

    // Round rows
    roundHistory.forEach((round, index) => {
        if (!round || !round.location || !round.scores) {
            console.warn(`Invalid round data at index ${index}:`, round);
            return;
        }
        gameOverText += `<tr><td>${index + 1}</td><td>${round.location}</td>`;
        players.forEach(p => {
            const scoreData = round.scores.find(s => s?.name === p.name);
            const scoreText = scoreData ? scoreData.score : '0';
            gameOverText += `<td>${scoreText}</td>`;
        });
        gameOverText += '</tr>';
    });

    // Total row
    gameOverText += '<tr class="average-row"><td colspan="2" style="text-align: center;">Total</td>';
    scores.forEach(p => {
        gameOverText += `<td>${p.total}</td>`;
    });
    gameOverText += '</tr>';

    gameOverText += '</table>';

    console.log('GameOver HTML:', gameOverText);
    try {
        document.getElementById("roundSummary").innerHTML = gameOverText;

        // Attach event listeners to buttons
        const playAgainButton = document.getElementById("playAgain");
        const backToHomeButton = document.getElementById("backToHome");
        playAgainButton.style.display = isHost ? "" : "none"; // Only host can restart
        playAgainButton.onclick = restartGame;
        backToHomeButton.onclick = returnToMenu;
    } catch (error) {
        console.error('Error setting roundSummary:', error);
        document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: Unable to display results.</p>';
    }
});

socket.on('gameEnded', (message) => {
    gameTerminated = true;
    document.getElementById("gameOver").classList.remove("hidden");
    document.getElementById("roundSummary").innerHTML = `<h3>Game Ended</h3><p>${message}</p>`;
    document.getElementById("playAgain").style.display = "none";
    document.getElementById("backToHome").onclick = returnToMenu;
});

socket.on('gameRestarted', ({ rounds, area, players }) => {
    maxRounds = rounds;
    selectedArea = area;
    round = 0;
    lastProcessedRound = 0;
    roundActive = false;
    document.getElementById("gameOver").classList.add("hidden");
    document.getElementById("guess").style.display = "";
    document.getElementById("result").textContent = "";
    clearMarkers();
    map.setView(getInitialMapSettings(selectedArea).center, getInitialMapSettings(selectedArea).zoom);
});

function submitGuess() {
    console.log('submitGuess called, round:', round, 'timeLeft:', timeLeft, 'roundActive:', roundActive, 'latestPin:', latestPin);
    if (latestPin && timeLeft > 0 && roundActive) {
        const guessData = { gameCode, guess: latestPin, playerName: localPlayerName, round };
        socket.emit('submitGuess', guessData);
        document.getElementById("guess").disabled = true;
        hasSubmittedGuess = true;
        console.log('Manual guess submitted:', guessData, 'hasSubmittedGuess set to true');
    } else {
        console.log('Guess not submitted: latestPin =', !!latestPin, 'timeLeft =', timeLeft, 'roundActive =', roundActive);
    }
}

function startNewRound() {
    console.log('startNewRound called');
    socket.emit('startNewRound', gameCode);
}

function restartGame() {
    if (!isHost) return;
    socket.emit('restartGame', gameCode);
}

function returnToMenu() {
    if (gameCode && !isHost && !gameTerminated) {
        socket.emit('playerLeaveGame', { gameCode });
    }
    if (gameCode && isHost && !gameTerminated) {
        socket.emit('hostLeaveLobby', { gameCode });
    }
    gameCode = null;
    window.location.href = 'index.html';
}

// Initialize map when the multiplayer page loads
if (window.location.pathname.includes('multiplayer.html')) {
    document.addEventListener('DOMContentLoaded', async () => {
        await initMap();
        // Fetch point and area locations, merge
        const pointsRes = await fetch('points.csv');
        const pointsText = await pointsRes.text();
        const pointRows = pointsText.split('\n').slice(1);
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
        const areaRes = await fetch('areas.geojson');
        const areaGeojson = await areaRes.json();
        const areaLocations = [];
        if (areaGeojson.features && Array.isArray(areaGeojson.features)) {
            areaGeojson.features.forEach(feature => {
                if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                    let coords = [];
                    if (feature.geometry.type === 'Polygon') {
                        coords = feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        // Flatten all rings into a single array of vertices
                        feature.geometry.coordinates.forEach(polygon => {
                            polygon[0].forEach(([lng, lat]) => {
                                coords.push({ lat, lng });
                            });
                        });
                    }
                    let latSum = 0, lngSum = 0;
                    coords.forEach(c => { latSum += c.lat; lngSum += c.lng; });
                    const centroid = coords.length > 0 ? { lat: latSum / coords.length, lng: lngSum / coords.length } : { lat: 0, lng: 0 };
                    areaLocations.push({
                        type: 'area',
                        name: feature.properties?.NAME || 'Unknown Area',
                        area: feature.properties?.AREA || feature.properties?.GAF_AREA || 'Unknown',
                        areaType: feature.properties?.TYPE || 'Unknown',
                        polygon: coords,
                        centroid
                    });
                }
            });
        }
        window.locations = [...pointLocations, ...areaLocations];
        // ...existing code...
    });
}