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
let guessSubmitted = false;
let gameTerminated = false;

function showSinglePlayer() {
    if (gameCode) {
        if (isHost) {
            socket.emit('hostLeaveLobby', { gameCode });
        } else {
            socket.emit('leaveLobby', { gameCode });
        }
    }
    document.getElementById('singlePlayerOptions').classList.remove('hidden');
    document.getElementById('multiplayerOptions').classList.add('hidden');
    document.getElementById('lobby').classList.add('hidden');
    gameCode = null;
}

function showMultiplayer() {
    if (gameCode) {
        if (isHost) {
            socket.emit('hostLeaveLobby', { gameCode });
        } else {
            socket.emit('leaveLobby', { gameCode });
        }
    }
    document.getElementById('singlePlayerOptions').classList.add('hidden');
    document.getElementById('multiplayerOptions').classList.remove('hidden');
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('hostForm').classList.add('hidden');
    document.getElementById('joinForm').classList.add('hidden');
    gameCode = null;
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
    const hostName = document.getElementById('hostName').value.trim();
    if (hostName) {
        localPlayerName = hostName;
        isHost = true;
        socket.emit('hostGame', { rounds: parseInt(rounds), area, hostName });
        showLobby();
        const playerList = document.getElementById('playerList');
        playerList.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = hostName;
        playerList.appendChild(li);
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
    }
}

function showLobby() {
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
    window.location.href = `multiplayer.html?gameCode=${gameCode}&rounds=${rounds}&area=${area}&playerName=${encodeURIComponent(localPlayerName)}`;
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

console.log('Emitting rejoinGame', gameCode, localPlayerName);
socket.emit('rejoinGame', { gameCode, playerName: localPlayerName });

socket.removeAllListeners('roundResults');
socket.removeAllListeners('newRound');
socket.removeAllListeners('timerUpdate');
socket.removeAllListeners('gameOver');
socket.removeAllListeners('gameEnded');
socket.removeAllListeners('playerRejoined');

socket.on('playerRejoined', ({ gameCode, playerName }) => {
    console.log(`Rejoined game ${gameCode} as ${playerName}`);
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

    map.addListener("click", (event) => {
        if (roundActive && timeLeft > 0) {
            if (marker) marker.setMap(null);
            marker = new google.maps.Marker({
                position: event.latLng,
                map: map
            });
            markers.push(marker);
            document.getElementById("guess").disabled = false;
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
}

socket.on('newRound', ({ round: newRound, maxRounds: newMaxRounds, location, timeLeft: serverTime }) => {
    console.log(`New round ${newRound} started: ${location}`);
    round = newRound;
    maxRounds = newMaxRounds;
    timeLeft = serverTime;
    roundActive = true;
    guessSubmitted = false;
    clearMarkers();
    document.getElementById("location").textContent = `Guess: ${location}`;
    document.getElementById("round").textContent = `Round: ${round}/${maxRounds}`;
    document.getElementById("timer").textContent = `Time left: ${timeLeft}s`;
    document.getElementById("guess").disabled = true;
    document.getElementById("guess").style.display = "inline";
    document.getElementById("newRound").disabled = true;
    document.getElementById("newRound").style.display = "inline";
    document.getElementById("result").textContent = "";
    map.setCenter(getInitialMapSettings(selectedArea).center);
    map.setZoom(getInitialMapSettings(selectedArea).zoom);
});

socket.on('timerUpdate', (newTime) => {
    timeLeft = newTime;
    document.getElementById("timer").textContent = `Time left: ${Math.max(0, timeLeft)}s`;
    if (timeLeft === 0 && marker && !guessSubmitted) {
        const guess = marker.getPosition();
        socket.emit('submitGuess', { gameCode, guess: { lat: guess.lat(), lng: guess.lng() } });
        guessSubmitted = true;
        document.getElementById("guess").disabled = true;
        console.log('Auto-submitted guess at 0 seconds');
    }
});

socket.on('roundResults', ({ round, location, results }) => {
    if (round <= lastProcessedRound) {
        console.log(`Ignoring duplicate round ${round} results for ${localPlayerName}`);
        return;
    }

    lastProcessedRound = round;
    console.log(`Received round ${round} results for ${localPlayerName}:`, results);
    roundActive = false;

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
                map.setCenter({ lat: location.lat1, lng: location.long1.NoSuchMethodError });
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
        }
    });
    document.getElementById("result").innerHTML = resultText;
    document.getElementById("newRound").disabled = false;
    document.getElementById("guess").disabled = true;
});

socket.on('gameOver', ({ players, roundHistory }) => {
    roundActive = false;
    document.getElementById("location").textContent = "";
    document.getElementById("timer").textContent = "";
    document.getElementById("result").textContent = "";
    document.getElementById("guess").style.display = "none";
    document.getElementById("newRound").style.display = "none";
    document.getElementById("gameOver").classList.remove("hidden");

    const averages = players.map(p => {
        const distances = roundHistory.map(r => r.scores.find(s => s.name === p.name)?.distance || null)
                                    .filter(d => d !== null);
        return {
            name: p.name,
            average: distances.length > 0 ? distances.reduce((sum, d) => sum + d, 0) / distances.length : Infinity
        };
    });
    const winner = averages.reduce((min, p) => p.average < min.average ? p : min, averages[0]);
    const summaryDiv = document.getElementById("roundSummary");
    let html = `<h2>Game over, ${winner.name} wins!</h2>`;
    html += '<table><thead>';
    html += `<tr><th colspan="2" class="no-border"></th><th colspan="${players.length}" class="distance-header">Distance (km)</th></tr>`;
    html += '<tr><th>Round</th><th>Location</th>';
    players.forEach(player => html += `<th>${player.name}</th>`);
    html += '</tr></thead><tbody>';

    roundHistory.forEach(round => {
        html += `<tr><td>${round.round}</td><td>${round.location}</td>`;
        players.forEach(player => {
            const distance = round.scores.find(s => s.name === player.name)?.distance;
            const distanceText = distance === null ? '-' : distance === 0 ? '0' : distance.toFixed(1);
            html += `<td>${distanceText}</td>`;
        });
        html += '</tr>';
    });

    html += '<tr><td colspan="2"><strong>Average</strong></td>';
    players.forEach(player => {
        const avg = averages.find(a => a.name === player.name).average;
        html += `<td><strong>${avg === Infinity ? '-' : avg.toFixed(1)}</strong></td>`;
    });
    html += '</tr></tbody></table>';

    html += `
        <div class="button-container">
            <button id="playAgain">Play Again</button>
            <button id="backToHome">Back to Home</button>
        </div>
    `;

    summaryDiv.innerHTML = html;

    document.getElementById("playAgain").addEventListener("click", () => {
        if (!gameTerminated) {
            socket.emit('restartGame', gameCode);
            document.getElementById("gameOver").classList.add("hidden");
        }
    });

    document.getElementById("backToHome").addEventListener("click", () => {
        socket.emit('playerLeaveGame', { gameCode });
        window.location.href = 'index.html';
    });
});

socket.on('gameRestarted', ({ rounds, area, players }) => {
    maxRounds = rounds;
    selectedArea = area;
    lastProcessedRound = 0;
    document.getElementById("gameOver").classList.add("hidden");
    clearMarkers();
    document.getElementById("guess").style.display = "inline";
    document.getElementById("newRound").style.display = "inline";
    console.log('Game restarted, resetting UI');
});

socket.on('gameEnded', (message) => {
    if (!isHost) {
        window.location.href = 'index.html';
    }
});

socket.on('gameTerminated', (message) => {
    if (!gameTerminated) {
        gameTerminated = true;
        window.location.href = 'index.html';
    }
});

document.getElementById("guess").addEventListener("click", () => {
    if (roundActive && timeLeft > 0 && !document.getElementById("guess").disabled) {
        const guess = marker.getPosition();
        socket.emit('submitGuess', { gameCode, guess: { lat: guess.lat(), lng: guess.lng() } });
        document.getElementById("guess").disabled = true;
        guessSubmitted = true;
        console.log('Guess submitted manually');
    }
});

document.getElementById("newRound").addEventListener("click", () => {
    if (!document.getElementById("newRound").disabled) {
        socket.emit('startNewRound', gameCode);
        document.getElementById("newRound").disabled = true;
        console.log('Requested new round for', gameCode);
    }
});

window.addEventListener('unload', () => {
    if (gameCode && !gameTerminated) {
        socket.emit('playerLeaveGame', { gameCode });
    }
});