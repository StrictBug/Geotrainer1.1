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
    window.location.href = `game.html?rounds=${rounds}&area=${area}`;
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
    const rounds = document.getElementById('sp-rounds').value;
    const area = document.getElementById('sp-area').value;
    const hostNameInput = document.getElementById('hostName').value.trim();
    if (hostNameInput) {
        localPlayerName = hostNameInput;
        hostName = hostNameInput;
        isHost = true;
        socket.emit('hostGame', { rounds: parseInt(rounds), area, hostName: hostNameInput });
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
        lobbyLeft.classList.add('non-host-lobby');
    }
}

function updateGameSettings() {
    if (!isHost) return;
    const rounds = document.getElementById('mp-rounds').value;
    const area = document.getElementById('mp-area').value;
    socket.emit('updateSettings', { gameCode, rounds: parseInt(rounds), area });
}

socket.on('gameHosted', (code) => {
    gameCode = code;
    updateGameCodeDisplay(code);
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

socket.on('settingsUpdated', ({ rounds, area }) => {
    maxRounds = rounds;
    selectedArea = area;
    const displayArea = area === 'All regions' ? 'All areas' : area;
    document.getElementById('areaDisplay').textContent = `Area: ${displayArea}`;
    document.getElementById('roundsDisplay').textContent = `Rounds: ${rounds}`;
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

socket.on('gameStarted', ({ rounds, area, players }) => {
    maxRounds = rounds;
    selectedArea = area;
    if (!hostName && players.length > 0) {
        hostName = players[0].name;
        console.log('Set hostName from gameStarted:', hostName);
    }
    window.location.href = `multiplayer.html?gameCode=${gameCode}&rounds=${rounds}&area=${area}&playerName=${encodeURIComponent(localPlayerName)}&hostName=${encodeURIComponent(hostName)}`;
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

    return {
        lat: latSum / count,
        lng: lngSum / count
    };
}

function initMap() {
    const mapSettings = getInitialMapSettings(selectedArea);
    map = new google.maps.Map(document.getElementById("map"), {
        center: mapSettings.center,
        zoom: mapSettings.zoom
    });

    console.log('GameOver visibility at start:', document.getElementById('gameOver').classList.contains('hidden'));

    // Explicitly attach event listeners to buttons
    const guessButton = document.getElementById("guess");
    const newRoundButton = document.getElementById("newRound");
    if (guessButton) {
        guessButton.onclick = () => {
            console.log('Guess button clicked, latestPin:', latestPin ? latestPin.toJSON() : null);
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

    map.addListener("click", (event) => {
        if (roundActive && timeLeft > 0) {
            if (marker) marker.setMap(null);
            marker = new google.maps.Marker({
                position: event.latLng,
                map: map
            });
            markers.push(marker);
            latestPin = event.latLng; // Update latest pin
            if (hasSubmittedGuess) {
                // Rescind previous guess if a new pin is placed
                socket.emit('rescindGuess', { gameCode, playerName: localPlayerName, round });
                hasSubmittedGuess = false;
                console.log('Rescinded previous guess due to new pin at:', event.latLng.toJSON());
            }
            guessButton.disabled = false; // Enable Guess button
            console.log('Marker placed at:', event.latLng.toJSON(), 'Guess button state: disabled =', guessButton.disabled, 'timeLeft =', timeLeft, 'hasSubmittedGuess =', hasSubmittedGuess);
        }
    });
}

function clearMarkers() {
    markers.forEach(m => {
        if (m.setMap) m.setMap(null);
        if (m.setPaths) m.setMap(null);
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
    map.setCenter(getInitialMapSettings(selectedArea).center);
    map.setZoom(getInitialMapSettings(selectedArea).zoom);
    console.log('Guess button after newRound: display =', document.getElementById("guess").style.display || 'default', 'disabled =', document.getElementById("guess").disabled);
});

socket.on('timerUpdate', (newTime) => {
    timeLeft = newTime;
    document.getElementById("timer").textContent = `Time left: ${Math.max(0, timeLeft)}s`;
    if (timeLeft <= 0 && latestPin) {
        const guessData = { gameCode, guess: { lat: latestPin.lat(), lng: latestPin.lng() }, playerName: localPlayerName, round };
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

    if (location.point) {
        const actual = new google.maps.LatLng(location.lat1, location.long1);
        const actualMarker = new google.maps.Marker({
            position: actual,
            map: map,
            icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
        });
        markers.push(actualMarker);
        map.setCenter(actual);
    } else {
        const vertices = [
            { lat: location.lat1, lng: location.long1 },
            { lat: location.lat2, lng: location.long2 },
            { lat: location.lat3, lng: location.long3 }
        ];
        if (location.lat4 && location.long4 && !isNaN(location.lat4) && !isNaN(location.long4)) {
            vertices.push({ lat: location.lat4, lng: location.long4 });
        }

        console.log('Multiplayer: Polygon vertices:', vertices);

        const validVertices = vertices.filter(v => !isNaN(v.lat) && !isNaN(v.lng));
        if (validVertices.length >= 3) {
            const polygon = new google.maps.Polygon({
                paths: validVertices,
                strokeColor: "#00FF00",
                strokeOpacity: 1.0,
                strokeWeight: 2,
                fillColor: "#00FF00",
                fillOpacity: 0.3
            });
            polygon.setMap(map);
            markers.push(polygon);

            const centroid = calculatePolygonCentroid(validVertices);
            if (centroid) {
                map.setCenter(centroid);
            } else {
                console.warn('Failed to calculate centroid, falling back to first vertex');
                map.setCenter({ lat: location.lat1, lng: location.long1 });
            }
        } else {
            console.error('Multiplayer: Insufficient valid vertices for polygon:', validVertices);
            map.setCenter({ lat: location.lat1, lng: location.long1 });
        }
    }

    map.setZoom(7);

    // Sort results by distance (closest to furthest, null as furthest)
    results.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });

    let resultText = '';
    results.forEach(r => {
        const distanceText = r.distance === null ? 'No guess' : r.distance === 0 ? '0 km' : r.distance.toFixed(1) + ' km';
        resultText += `<p class="score-line">${r.name}: ${distanceText}</p>`;
        if (r.guess) {
            const playerMarker = new google.maps.Marker({
                position: { lat: r.guess.lat, lng: r.guess.lng },
                map: map,
                label: r.name[0]
            });
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
    document.getElementById("result").textContent = "";
    document.getElementById("guess").style.display = "none";
    document.getElementById("newRound").style.display = "none";
    document.getElementById("gameOver").classList.remove("hidden");

    // Validate data and handle edge cases
    if (!players || !Array.isArray(players) || players.length === 0 || !roundHistory || !Array.isArray(roundHistory)) {
        console.error('Invalid gameOver data:', { players, roundHistory });
        document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: No valid game data available.</p>';
        return;
    }

    // Calculate averages and find winner
    let averages;
    let winner;
    try {
        averages = players.map(p => {
            if (!p || !p.name) throw new Error('Invalid player data');
            const distances = roundHistory
                .map(r => r.scores?.find(s => s?.name === p.name)?.distance || null)
                .filter(d => d !== null);
            return {
                name: p.name,
                average: distances.length > 0 ? distances.reduce((sum, d) => sum + d, 0) / distances.length : Infinity
            };
        });

        if (averages.length === 0) throw new Error('No valid averages calculated');
        winner = averages.reduce((min, p) => (p.average < min.average ? p : min), averages[0]);
    } catch (error) {
        console.error('Error calculating averages:', error);
        document.getElementById("roundSummary").innerHTML = '<h3>Game Over!</h3><p>Error: Unable to calculate scores.</p>';
        return;
    }

    // Build table HTML to match the desired layout
    let gameOverText = `<h3>Game over, ${winner.name} wins!</h3>`;
    gameOverText += '<table>';
    // First row: "Distance (km)" header spanning player columns
    gameOverText += `<tr><th class="no-border"></th><th class="no-border"></th><th colspan="${players.length}" class="distance-header">Distance (km)</th></tr>`;
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
            const score = round.scores.find(s => s?.name === p.name);
            const distanceText = score?.distance === null ? 'No guess' : score.distance === 0 ? '0' : score.distance.toFixed(1);
            gameOverText += `<td>${distanceText}</td>`;
        });
        gameOverText += '</tr>';
    });

    // Average row with merged "Average" cell, centered text, and bold styling
    gameOverText += '<tr class="average-row"><td colspan="2" style="text-align: center;">Average</td>';
    averages.forEach(p => {
        const avgText = p.average === Infinity ? 'N/A' : p.average.toFixed(1);
        gameOverText += `<td>${avgText}</td>`;
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
    map.setCenter(getInitialMapSettings(selectedArea).center);
    map.setZoom(getInitialMapSettings(selectedArea).zoom);
});

function submitGuess() {
    console.log('submitGuess called, round:', round, 'timeLeft:', timeLeft, 'roundActive:', roundActive, 'latestPin:', latestPin ? latestPin.toJSON() : null);
    if (latestPin && timeLeft > 0 && roundActive) {
        const guessData = { gameCode, guess: { lat: latestPin.lat(), lng: latestPin.lng() }, playerName: localPlayerName, round };
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