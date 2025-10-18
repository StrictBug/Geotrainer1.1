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
window.isHost = false;

socket.on('gameStarted', ({ rounds, areas, locationTypes, roundLength, players }) => {
    console.log('Game started with settings:', { rounds, areas, locationTypes, roundLength });
    maxRounds = rounds;
    selectedAreas = areas;
    selectedLocationTypes = locationTypes;
    selectedRoundLength = roundLength;
    if (!hostName && players.length > 0) {
        hostName = players[0].name;
        console.log('Set hostName from gameStarted:', hostName);
    }
    
    // Build URL with all settings
    const params = new URLSearchParams({
        gameCode: gameCode,
        rounds: rounds,
        areas: areas.join(','),
        locationTypes: locationTypes.join(','),
        roundLength: roundLength,
        playerName: localPlayerName,
        hostName: hostName
    });
    
    if (!window.location.pathname.includes('multiplayer.html')) {
        window.location.href = `multiplayer.html?${params.toString()}`;
    }
    console.log('Redirecting to game page with params:', params.toString());
});

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
    const areaDropdown = document.getElementById('mp-area');
    const typeDropdown = document.getElementById('mp-locationType');
    const roundLength = document.getElementById('mp-roundLength').value;
    const hostNameInput = document.getElementById('hostName').value.trim();

    // Get selected areas and types
    const areas = Array.from(areaDropdown.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const locationTypes = Array.from(typeDropdown.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    if (hostNameInput) {
        localPlayerName = hostNameInput;
        hostName = hostNameInput;
        window.isHost = true;
        socket.emit('hostGame', { 
            rounds: parseInt(rounds), 
            areas: areas.length > 0 ? areas : ['All regions'],
            locationTypes: locationTypes.length > 0 ? locationTypes : ['all'],
            roundLength: parseInt(roundLength), 
            hostName: hostNameInput 
        });
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
        
        // Initialize non-host settings display
        if (selectedAreas && document.getElementById('nh-areaDisplay')) {
            const areaDisplay = selectedAreas.includes('All regions') ? 'All areas' : selectedAreas.join(', ');
            document.getElementById('nh-areaDisplay').textContent = areaDisplay;
            
            const typeDisplay = selectedLocationTypes.includes('all') ? 'All types' : selectedLocationTypes.join(', ');
            document.getElementById('nh-locationTypeDisplay').textContent = typeDisplay;
            
            if (document.getElementById('nh-roundsDisplay')) {
                document.getElementById('nh-roundsDisplay').textContent = maxRounds;
            }
            if (document.getElementById('nh-roundLengthDisplay')) {
                document.getElementById('nh-roundLengthDisplay').textContent = selectedRoundLength + ' seconds';
            }
        }
    }
}

function updateGameSettings() {
    if (!isHost) return;
    
    const rounds = document.getElementById('mp-rounds').value;
    const roundLength = document.getElementById('mp-roundLength').value;

    // Get selected areas
    const areaDropdown = document.getElementById('mp-area');
    const selectedAreas = Array.from(areaDropdown.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    
    // If no areas are selected, default to 'All regions'
    if (selectedAreas.length === 0) {
        selectedAreas.push('All regions');
    }

    // Get selected location types
    const typeDropdown = document.getElementById('mp-locationType');
    const selectedTypes = Array.from(typeDropdown.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    
    // If no types are selected, default to 'all'
    if (selectedTypes.length === 0) {
        selectedTypes.push('all');
    }

    console.log('Updating settings:', {
        gameCode,
        rounds: parseInt(rounds),
        areas: selectedAreas,
        locationTypes: selectedTypes,
        roundLength: parseInt(roundLength)
    });

    socket.emit('updateSettings', {
        gameCode,
        rounds: parseInt(rounds),
        areas: selectedAreas,
        locationTypes: selectedTypes,
        roundLength: parseInt(roundLength)
    });
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

socket.on('settingsUpdated', (settings) => {
    // Store the settings
    maxRounds = settings.rounds;
    selectedAreas = settings.areas || ['All regions'];
    selectedLocationTypes = settings.locationTypes || ['all'];
    selectedRoundLength = settings.roundLength || 15;
    
    // Update displays if they exist (handles both game and lobby views)
    if (document.getElementById('nh-areaDisplay')) {
        // Format area display text
        const areaDisplay = selectedAreas.includes('All regions') ? 'All areas' : selectedAreas.join(', ');
        document.getElementById('nh-areaDisplay').textContent = areaDisplay;
        
        // Format location type display text
        const typeDisplay = selectedLocationTypes.includes('all') ? 'All types' : selectedLocationTypes.join(', ');
        document.getElementById('nh-locationTypeDisplay').textContent = typeDisplay;
        
        document.getElementById('nh-roundsDisplay').textContent = maxRounds;
        document.getElementById('nh-roundLengthDisplay').textContent = selectedRoundLength + ' seconds';
    }
    
    console.log('Settings updated:', {
        rounds: maxRounds,
        areas: selectedAreas,
        types: selectedLocationTypes,
        roundLength: selectedRoundLength
    });
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
    console.log('Host starting game with code:', gameCode);
    document.getElementById('startMultiplayer').disabled = true;
    document.getElementById('startMultiplayer').textContent = 'Starting...';
    socket.emit('startGame', gameCode);
}

// Removed duplicate gameStarted handler

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
selectedAreas = urlParams.get('areas') ? urlParams.get('areas').split(',') : ['All regions'];
selectedLocationTypes = urlParams.get('locationTypes') ? urlParams.get('locationTypes').split(',') : ['all'];
selectedRoundLength = parseInt(urlParams.get('roundLength')) || 15;
localPlayerName = decodeURIComponent(urlParams.get('playerName') || '');
hostName = decodeURIComponent(urlParams.get('hostName') || '');
window.isHost = localPlayerName === hostName;

console.log('Emitting rejoinGame', gameCode, localPlayerName);
console.log('Initial state: isHost =', isHost, 'localPlayerName =', localPlayerName, 'hostName =', hostName);
socket.emit('rejoinGame', { gameCode, playerName: localPlayerName });

socket.on('playerRejoined', ({ gameCode, playerName }) => {
    console.log(`Rejoined game ${gameCode} as ${playerName}, isHost: ${isHost}`);
});

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

    // Handle MAFC and BAFC
    if (area === 'MAFC') {
        return getCombinedBounds(['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS']);
    } else if (area === 'BAFC') {
        return getCombinedBounds(['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E']);
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
    if (latSpan > 2 || lngSpan > 3) return 6;    // Medium area (including TAS)
    return 7;  // Small area
}

function getInitialMapSettings(areas) {
    // If it's a string, convert it to an array
    if (typeof areas === 'string') {
        areas = areas.split(',');
    }

    // Default Australia-wide view settings
    const defaultView = { center: [-25.2744, 133.7751], zoom: 3 };

    // If no areas or All regions selected, return default view
    if (!areas || 
        areas.length === 0 || 
        areas.includes('All regions')) {
        return defaultView;
    }

    // If both MAFC and BAFC are selected, calculate bounds from all their sub-areas
    if (areas.includes('MAFC') && areas.includes('BAFC')) {
        const allAreas = ['WA-N', 'WA-S', 'SA', 'VIC', 'TAS', 'NSW-W', 'NSW-E', 'QLD-S', 'QLD-N', 'NT'];
        const bounds = getCombinedBounds(allAreas);
        return {
            center: [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLng + bounds.maxLng) / 2],
            zoom: calculateZoomLevel(bounds)
        };
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
    const bounds = selectedAreas.includes('VAAC') 
        ? { minLat: -17.727759, maxLat: 14.349548, minLng: 91.494141, maxLng: 166.816406 }
        : getAreaBounds(selectedAreas[0]);
    
    const center = [
        (bounds.minLat + bounds.maxLat) / 2,
        (bounds.minLng + bounds.maxLng) / 2
    ];
    const zoom = calculateZoomLevel(bounds);
    
    // Initialize Leaflet map with constrained zoom matching local tiles
    map = L.map('map', { 
        minZoom: 3, 
        maxZoom: 9,
        tms: false,
        worldCopyJump: true, // Enable proper dateline handling
        maxBounds: [[-55, 33.3], [25, 236.7]], // Exact domain bounds from map tiles
        maxBoundsViscosity: 1.0 // Make the bounds completely rigid
    }).setView([center[0], 135], zoom);

    // Disable dragging at zoom level 3
    map.on('zoomend', function() {
        if (map.getZoom() === 3) {
            map.dragging.disable();
        } else {
            map.dragging.enable();
        }
    });

    // Add custom topographic tiles (EPSG:3857)
    L.tileLayer('/topo/tiles/{z}/{x}/{y}', {
        minZoom: 3,
        maxZoom: 9,
        tms: false,
        noWrap: false, // Allow continuous display across dateline
        attribution: 'Map data &copy; Bureau of Meteorology'
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
    hasSubmittedGuess = false;
    clearMarkers();
    
    const locationElem = document.getElementById("location");
    const roundElem = document.getElementById("round");
    const timerElem = document.getElementById("timer");
    const guessBtn = document.getElementById("guess");
    const newRoundBtn = document.getElementById("newRound");
    const resultElem = document.getElementById("result");
    const gameOverElem = document.getElementById("gameOver");
    
    if (locationElem) locationElem.textContent = `Guess: ${location}`;
    if (roundElem) roundElem.textContent = `Round: ${round}/${maxRounds}`;
    if (timerElem) timerElem.textContent = `Time left: ${timeLeft}s`;
    if (guessBtn) {
        guessBtn.disabled = true;
        guessBtn.style.display = "";
    }
    if (newRoundBtn) newRoundBtn.style.display = "none";
    if (resultElem) resultElem.textContent = "";
    if (gameOverElem) gameOverElem.classList.add("hidden");
    
    if (map) {
        // Reset the map view to show all selected areas at the start of each round
        const settings = getInitialMapSettings(selectedAreas);
        map.setView(settings.center, settings.zoom);
    }
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

    // Always clear existing markers before showing results
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
        if (location.isMultiPolygon && location.polygonParts) {
            // Handle multipolygon areas
            location.polygonParts.forEach(polygonCoords => {
                if (polygonCoords && polygonCoords.length >= 3) {
                    const leafletCoords = polygonCoords.map(v => [v.lat, v.lng]);
                    const polygon = L.polygon(leafletCoords, style).addTo(map);
                    markers.push(polygon);
                }
            });
        } else if (location.polygon) {
            // Handle single polygons
            const leafletCoords = location.polygon.map(v => [v.lat, v.lng]);
            const polygon = L.polygon(leafletCoords, style).addTo(map);
            markers.push(polygon);
        }

        // Calculate appropriate zoom level and center based on area size
        let polygonParts = [];
        if (location.isMultiPolygon && location.polygonParts) {
            polygonParts = location.polygonParts;
        } else if (location.polygon) {
            polygonParts = [location.polygon];
        }
        
        const bounds = calculateAreaBounds(polygonParts);
        const zoomLevel = calculateAppropriateZoom(bounds);

        // Calculate the center point from the bounds
        const centerLat = (bounds.minLat + bounds.maxLat) / 2;
        const centerLng = (bounds.minLng + bounds.maxLng) / 2;
        
        if (!isNaN(centerLat) && !isNaN(centerLng)) {
            map.setView([centerLat, centerLng], zoomLevel);
        } else {
            console.error('Multiplayer: Invalid bounds:', bounds);
            map.setView(getInitialMapSettings(selectedAreas).center, getInitialMapSettings(selectedAreas).zoom);
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
    const lastRound = roundHistory[roundHistory.length - 1];
    if (lastRound && lastRound.location) {
        // Keep existing markers and show final location
        document.getElementById("location").textContent = `Guess: ${lastRound.location}`;
        document.getElementById("timer").textContent = "";
        document.getElementById("result").textContent = "Scoreboard showing in 5 seconds...";
    }
    document.getElementById("guess").style.display = "none";
    document.getElementById("newRound").style.display = "none";

    // Do not clear markers, keep them visible for the final location
    // Only adjust the map view if needed to show all markers
    if (map && lastRound && lastRound.results && lastRound.results.length > 0) {
        const bounds = L.latLngBounds([]);
        lastRound.results.forEach(r => {
            if (r.guess) {
                bounds.extend([r.guess.lat, r.guess.lng]);
            }
        });
        if (lastRound.location) {
            bounds.extend([lastRound.location.lat, lastRound.location.lng]);
        }
        if (!bounds.isValid()) {
            map.setView(getInitialMapSettings(selectedArea || 'All regions').center, 
                       getInitialMapSettings(selectedArea || 'All regions').zoom);
        } else {
            map.fitBounds(bounds.pad(0.5));
        }
    }
    
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

        // Build game over table
        let gameOverText = `<h3>Game over, ${winner.name} wins!</h3>`;
        gameOverText += '<table>';
        
        // Score header spanning player columns
        gameOverText += `<tr><th class="no-border"></th><th class="no-border"></th><th colspan="${players.length}" class="distance-header">Score</th></tr>`;
        
        // Column headers
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
        gameOverText += '</tr></table>';

        // Update display and set up buttons
        document.getElementById("roundSummary").innerHTML = gameOverText;
        const playAgainButton = document.getElementById("playAgain");
        const backToHomeButton = document.getElementById("backToHome");
        playAgainButton.style.display = isHost ? "" : "none";
        playAgainButton.onclick = restartGame;
        backToHomeButton.onclick = returnToMenu;
    }, 5000);
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

document.addEventListener('DOMContentLoaded', async () => {
    // Only initialize game elements if we're on the multiplayer game page
    if (window.location.pathname.includes('multiplayer.html')) {
        console.log('Initializing multiplayer game page');
        if (!map) {
            await initMap();
            console.log('Map initialized');
        }
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
                    let parts = [];
                    if (feature.geometry.type === 'Polygon') {
                        const coords = feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
                        parts.push(coords);
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        // Keep each polygon part separate
                        feature.geometry.coordinates.forEach(polygon => {
                            const coords = polygon[0].map(([lng, lat]) => ({ lat, lng }));
                            parts.push(coords);
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
                        areaType: feature.properties?.TYPE || 'Unknown',
                        polygon: parts[0], // Use first part for compatibility
                        polygonParts: parts, // Store all parts for rendering
                        isMultiPolygon: feature.geometry.type === 'MultiPolygon',
                        centroid
                    });
                }
            });
        }
        window.locations = [...pointLocations, ...areaLocations];
        console.log('Locations loaded:', window.locations.length);
    }
});