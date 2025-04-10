const socket = io();
console.log('Connected to server');
let map;
let marker;
let score = 0; // Kept for internal tracking
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
let guessSubmitted = false; // Track if a guess has been submitted for the round
let gameTerminated = false; // Flag to track if game was terminated due to player leaving

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
    document.getElementById('joinError').classList.add('hidden'); // Reset error when showing form
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
        // Wait for server response instead of calling showLobby() here
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
        showLobby(); // Show lobby only on successful join
        document.getElementById('joinError').classList.add('hidden'); // Clear error
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
        // Still on join form
        document.getElementById('joinError').textContent = message;
        document.getElementById('joinError').classList.remove('hidden');
    } else {
        // In lobby or elsewhere
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

// Multiplayer game logic
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
        case 'All regions':
        default: return { center: { lat: -25.2744, lng: 133.7751 }, zoom: 4 };
    }
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
    markers.forEach(m => m.setMap(null));
    markers = [];
    marker = null;
}

socket.on('newRound', ({ round: newRound, maxRounds: newMaxRounds, location, timeLeft: serverTime }) => {
    console.log(`New round ${newRound} started: ${location}`);
    round = newRound;
    maxRounds = newMaxRounds;
    timeLeft = serverTime;
    roundActive = true;
    guessSubmitted = false; // Reset for new round
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
    timeLeft = newTime; // Allow negative values internally
    document.getElementById("timer").textContent = `Time left: ${Math.max(0, timeLeft)}s`; // Clamp display to 0
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
    const actual = new google.maps.LatLng(location.lat, location.lng);
    const actualMarker = new google.maps.Marker({
        position: actual,
        map: map,
        icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
    });
    markers.push(actualMarker);
    map.setCenter(actual);
    map.setZoom(8);

    let resultText = ''; // No prefix
    results.forEach(r => {
        resultText += `<p class="score-line">${r.name}: ${r.distance ? r.distance.toFixed(1) + ' km' : 'No guess'} - ${r.points} pts (Total: ${r.totalScore})</p>`;
        if (r.guess) {
            const playerMarker = new google.maps.Marker({
                position: { lat: r.guess.lat, lng: r.guess.lng },
                map: map,
                label: r.name[0]
            });
            markers.push(playerMarker);
        }
        if (r.name === localPlayerName) {
            console.log(`Updating score for ${localPlayerName}: ${score} -> ${r.totalScore}`);
            score = r.totalScore;
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

    const winner = players.reduce((max, p) => p.score > max.score ? p : max, players[0]);
    const summaryDiv = document.getElementById("roundSummary");
    let html = `<h2>Game over, ${winner.name} wins!</h2>`;
    html += '<table><thead><tr><th>Round</th><th>Location</th>';
    players.forEach(player => html += `<th>${player.name}</th>`);
    html += '</tr></thead><tbody>';

    roundHistory.forEach(round => {
        html += `<tr><td>${round.round}</td><td>${round.location}</td>`;
        players.forEach(player => {
            const score = round.scores.find(s => s.name === player.name)?.points || 0;
            html += `<td>${score}</td>`;
        });
        html += '</tr>';
    });

    html += '<tr><td colspan="2"><strong>Total</strong></td>';
    players.forEach(player => html += `<td><strong>${player.score}</strong></td>`);
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
        socket.emit('playerLeaveGame', { gameCode }); // Notify server of player leaving
        window.location.href = 'index.html';
    });
});

socket.on('gameRestarted', ({ rounds, area, players }) => {
    maxRounds = rounds;
    selectedArea = area;
    score = 0;
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
        // Removed alert(message) to avoid pop-up
        window.location.href = 'index.html';
    }
});

document.getElementById("guess").addEventListener("click", () => {
    if (roundActive && timeLeft > 0 && !document.getElementById("guess").disabled) {
        const guess = marker.getPosition();
        socket.emit('submitGuess', { gameCode, guess: { lat: guess.lat(), lng: guess.lng() } });
        document.getElementById("guess").disabled = true;
        guessSubmitted = true; // Mark guess as submitted
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

// Ensure cleanup on page unload (e.g., browser close)
window.addEventListener('unload', () => {
    if (gameCode && !gameTerminated) {
        socket.emit('playerLeaveGame', { gameCode });
    }
});