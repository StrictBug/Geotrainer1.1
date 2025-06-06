const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '.')));

const games = {};
let locations = [];

function loadLocations() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'locations.csv'), 'utf8');
        const rows = data.trim().split('\n');
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
        console.log(`Loaded ${locations.length} locations`);
    } catch (error) {
        console.error('Error loading locations.csv:', error);
    }
}

function generateGameCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function startRound(gameCode) {
    const game = games[gameCode];
    if (!game || game.state !== 'playing') {
        console.log(`Cannot start round for ${gameCode}: Invalid state (${game?.state})`);
        return;
    }

    game.round = (game.round || 0) + 1;
    const area = game.settings.area;
    let availableLocations = locations.filter(loc => !game.usedLocations?.includes(loc));
    if (area !== 'All regions') {
        if (area === 'MAFC') {
            availableLocations = availableLocations.filter(loc => 
                ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'].includes(loc.area)
            );
        } else if (area === 'BAFC') {
            availableLocations = availableLocations.filter(loc => 
                ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'].includes(loc.area)
            );
        } else {
            availableLocations = availableLocations.filter(loc => loc.area === area);
        }
    }
    if (availableLocations.length === 0) {
        game.usedLocations = [];
        availableLocations = locations;
        if (area !== 'All regions') {
            if (area === 'MAFC') {
                availableLocations = availableLocations.filter(loc => 
                    ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'].includes(loc.area)
                );
            } else if (area === 'BAFC') {
                availableLocations = availableLocations.filter(loc => 
                    ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'].includes(loc.area)
                );
            } else {
                availableLocations = availableLocations.filter(loc => loc.area === area);
            }
        }
    }
    if (availableLocations.length === 0) {
        console.error(`No locations available for ${gameCode}`);
        io.to(gameCode).emit('gameEnded', 'No locations available');
        return;
    }
    const randomIndex = Math.floor(Math.random() * availableLocations.length);
    const location = availableLocations[randomIndex];
    game.usedLocations = game.usedLocations || [];
    game.usedLocations.push(location);
    game.currentLocation = location;
    game.guesses = {};
    game.timeLeft = 15;
    game.roundEnded = false;

    console.log(`Starting round ${game.round} in ${gameCode}: ${location.name}`);
    io.to(gameCode).emit('newRound', {
        round: game.round,
        maxRounds: game.settings.rounds,
        location: location.name,
        timeLeft: game.timeLeft
    });

    const timer = setInterval(() => {
        game.timeLeft--;
        io.to(gameCode).emit('timerUpdate', game.timeLeft);
        console.log(`Timer update for ${gameCode}: ${game.timeLeft}s`);
        if (!game.roundEnded && game.timeLeft <= -1) {
            clearInterval(timer);
            endRound(gameCode);
        }
    }, 1000);
    game.timer = timer;
}

function haversineDistance(coord1, coord2) {
    if (!coord1 || !coord2 || isNaN(coord1.lat) || isNaN(coord1.lng) || isNaN(coord2.lat) || isNaN(coord2.lng)) {
        console.warn('Invalid coordinates in haversineDistance:', { coord1, coord2 });
        return Infinity;
    }

    const R = 6371;
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (isNaN(distance)) {
        console.warn('NaN in haversineDistance:', { coord1, coord2 });
        return Infinity;
    }
    return distance;
}

function distanceToSegmentServer(guess, v1, v2) {
    if (!guess || !v1 || !v2 ||
        isNaN(guess.lat) || isNaN(guess.lng) ||
        isNaN(v1.lat) || isNaN(v1.lng) ||
        isNaN(v2.lat) || isNaN(v2.lng)) {
        console.warn('Invalid coordinates in distanceToSegmentServer:', { guess, v1, v2 });
        return Infinity;
    }

    if (v1.lat === v2.lat && v1.lng === v2.lng) {
        console.log('Degenerate segment, computing point-to-point distance');
        return haversineDistance(guess, v1);
    }

    const A = guess.lat - v1.lat;
    const B = guess.lng - v1.lng;
    const C = v2.lat - v1.lat;
    const D = v2.lng - v1.lng;

    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) {
        const dot = A * C + B * D;
        param = dot / len_sq;
    }

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

    const distance = haversineDistance(guess, { lat: xx, lng: yy });
    if (isNaN(distance) || !isFinite(distance)) {
        console.warn('Invalid distance in distanceToSegmentServer:', { guess, v1, v2, xx, yy });
        return Infinity;
    }
    return distance;
}

function pointInPolygon(point, vertices) {
    if (!point || !vertices || vertices.length < 3) {
        console.warn('Invalid inputs in pointInPolygon:', { point, vertices });
        return false;
    }

    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].lat, yi = vertices[i].lng;
        const xj = vertices[j].lat, yj = vertices[j].lng;

        if (isNaN(xi) || isNaN(yi) || isNaN(xj) || isNaN(yj)) {
            console.warn('Invalid vertex in pointInPolygon:', { xi, yi, xj, yj });
            continue;
        }

        const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
                          (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function calculateScore(distance) {
    if (distance === null || !isFinite(distance)) {
        return 0;
    }
    const rawScore = Math.max(0, 1000 - Math.floor(distance));
    return Math.round(rawScore / 10) * 10;
}

function endRound(gameCode) {
    const game = games[gameCode];
    if (!game || game.state !== 'playing' || game.roundEnded) return;
    game.roundEnded = true;

    console.log(`Ending round ${game.round} for ${gameCode}, guesses:`, game.guesses);

    const results = game.players.map(player => {
        const guess = game.guesses[player.id];
        let distance = null;
        let score = 0;
        if (guess) {
            if (game.currentLocation.point) {
                const actual = { lat: game.currentLocation.lat1, lng: game.currentLocation.long1 };
                distance = haversineDistance(guess, actual);
            } else {
                const vertices = [
                    { lat: game.currentLocation.lat1, lng: game.currentLocation.long1 },
                    { lat: game.currentLocation.lat2, lng: game.currentLocation.long2 },
                    { lat: game.currentLocation.lat3, lng: game.currentLocation.long3 }
                ];
                if (game.currentLocation.lat4 && game.currentLocation.long4 && 
                    !isNaN(game.currentLocation.lat4) && !isNaN(game.currentLocation.long4)) {
                    vertices.push({ lat: game.currentLocation.lat4, lng: game.currentLocation.long4 });
                }

                console.log('Server: Guess coordinates:', guess);
                console.log('Server: Polygon vertices:', vertices);

                const validVertices = vertices.filter(v => !isNaN(v.lat) && !isNaN(v.lng));
                if (validVertices.length < 3) {
                    console.error('Server: Insufficient valid vertices:', validVertices);
                    distance = 95;
                } else if (pointInPolygon(guess, validVertices)) {
                    distance = 0;
                    console.log('Server: Guess inside polygon, distance: 0');
                } else {
                    const distances = [];
                    for (let i = 0; i < validVertices.length; i++) {
                        const j = (i + 1) % validVertices.length;
                        const dist = distanceToSegmentServer(guess, validVertices[i], validVertices[j]);
                        if (!isNaN(dist) && isFinite(dist)) {
                            distances.push(dist);
                        }
                    }

                    distance = distances.length > 0 ? Math.min(...distances) : 95;
                    console.log('Server: Distances to edges:', distances, 'Selected distance:', distance);

                    if (!isFinite(distance)) {
                        console.warn('Server: No valid edge distances, defaulting to 95 km');
                        distance = 95;
                    }
                }
            }
            score = calculateScore(distance);
        } else {
            console.log(`No guess submitted by ${player.name} in round ${game.round}, score: 0`);
        }
        return { name: player.name, guess, distance, score };
    });

    game.roundHistory = game.roundHistory || [];
    game.roundHistory.push({
        round: game.round,
        location: game.currentLocation.name,
        scores: results.map(r => ({ name: r.name, distance: r.distance, score: r.score }))
    });

    console.log(`Round ${game.round} ended in ${gameCode}, results:`, results);
    io.to(gameCode).emit('roundResults', {
        round: game.round,
        location: game.currentLocation,
        results
    });

    if (game.round >= game.settings.rounds) {
        io.to(gameCode).emit('gameOver', {
            players: game.players,
            roundHistory: game.roundHistory
        });
        game.state = 'ended';
        console.log(`Game ${gameCode} ended after round ${game.round}`);
    }
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('hostGame', ({ rounds, area, hostName }) => {
        const gameCode = generateGameCode();
        games[gameCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: hostName, ready: false, disconnected: false }],
            settings: { rounds, area },
            state: 'lobby',
            round: 0
        };
        socket.join(gameCode);
        socket.emit('gameHosted', gameCode);
        io.to(gameCode).emit('playerList', games[gameCode].players);
        io.to(gameCode).emit('settingsUpdated', games[gameCode].settings);
        io.to(gameCode).emit('updateGameCode', gameCode);
        console.log(`Game hosted: ${gameCode} by ${hostName}`);
    });

    socket.on('joinGame', ({ gameCode, playerName }) => {
        if (!games[gameCode]) {
            socket.emit('error', 'Invalid game code');
            return;
        }
        if (games[gameCode].state !== 'lobby') {
            socket.emit('error', 'Game already started');
            return;
        }
        games[gameCode].players.push({ id: socket.id, name: playerName, ready: false, disconnected: false });
        socket.join(gameCode);
        io.to(gameCode).emit('playerList', games[gameCode].players);
        io.to(gameCode).emit('settingsUpdated', games[gameCode].settings);
        io.to(gameCode).emit('updateGameCode', gameCode);
        console.log(`${playerName} joined ${gameCode}`);
    });

    socket.on('updateSettings', ({ gameCode, rounds, area }) => {
        if (!games[gameCode] || games[gameCode].host !== socket.id) {
            console.log(`Invalid settings update request for ${gameCode} by ${socket.id}`);
            return;
        }
        games[gameCode].settings = { rounds, area };
        io.to(gameCode).emit('settingsUpdated', { rounds, area });
        console.log(`Settings updated for ${gameCode}: ${area}, ${rounds} rounds`);
    });

    socket.on('startGame', (gameCode) => {
        if (!games[gameCode] || games[gameCode].host !== socket.id) {
            console.log(`Invalid start request for ${gameCode} by ${socket.id}`);
            return;
        }
        games[gameCode].state = 'playing';
        games[gameCode].rejoinedPlayers = new Set();
        io.to(gameCode).emit('gameStarted', {
            rounds: games[gameCode].settings.rounds,
            area: games[gameCode].settings.area,
            players: games[gameCode].players
        });
        console.log(`Game ${gameCode} started, waiting for players to rejoin`);
    });

    socket.on('rejoinGame', ({ gameCode, playerName }) => {
        console.log(`Received rejoin request for ${gameCode} from ${playerName}`);
        const game = games[gameCode];
        if (!game) {
            console.log(`No game found for ${gameCode}`);
            return;
        }
        if (game.state === 'playing' || game.state === 'ended') {
            const player = game.players.find(p => p.name === playerName);
            if (player) {
                player.id = socket.id;
                player.disconnected = false;
                socket.join(gameCode);
                game.rejoinedPlayers.add(playerName);
                console.log(`${playerName} rejoined ${gameCode} with new ID ${socket.id}`);
                socket.emit('playerRejoined', { gameCode, playerName });
                if (game.state === 'playing' && game.round === 0 && game.rejoinedPlayers.size === game.players.length) {
                    console.log(`All players rejoined ${gameCode}, starting first round`);
                    startRound(gameCode);
                }
            } else {
                console.log(`Player ${playerName} not found in ${gameCode}`);
            }
        }
    });

    socket.on('submitGuess', ({ gameCode, guess, playerName, round }) => {
        const game = games[gameCode];
        if (!game || game.state !== 'playing') {
            console.log(`Guess rejected for ${socket.id} in ${gameCode}: Invalid game state`);
            return;
        }
        if (round !== game.round) {
            console.log(`Guess rejected for ${socket.id} in ${gameCode}: Round mismatch (submitted for round ${round}, current round ${game.round})`);
            return;
        }
        if (game.roundEnded) {
            console.log(`Guess rejected for ${socket.id} in ${gameCode}: Round already ended`);
            return;
        }

        const player = game.players.find(p => p.name === playerName);
        if (!player) {
            console.log(`Guess rejected for ${socket.id} in ${gameCode}: Player ${playerName} not found`);
            return;
        }

        const guessesBefore = JSON.stringify(game.guesses[player.id]);
        game.guesses[player.id] = guess;
        console.log(`Guess ${guessesBefore ? 'updated' : 'submitted'} by ${playerName} (ID: ${player.id}) in ${gameCode} at ${game.timeLeft}s:`, guess, `Previous guess: ${guessesBefore || 'none'}`);

        // Check if all active players have submitted guesses
        const activePlayers = game.players.filter(p => !p.disconnected);
        const allGuessesSubmitted = activePlayers.every(p => game.guesses[p.id]);
        if (allGuessesSubmitted && game.timeLeft >= 0) {
            clearInterval(game.timer);
            endRound(gameCode);
        }
    });

    socket.on('rescindGuess', ({ gameCode, playerName, round }) => {
        const game = games[gameCode];
        if (!game || game.state !== 'playing') {
            console.log(`Rescind request rejected for ${playerName} in ${gameCode}: Invalid game state`);
            return;
        }
        if (round !== game.round) {
            console.log(`Rescind request rejected for ${playerName} in ${gameCode}: Round mismatch (requested for round ${round}, current round ${game.round})`);
            return;
        }
        if (game.roundEnded) {
            console.log(`Rescind request rejected for ${playerName} in ${gameCode}: Round already ended`);
            return;
        }

        const player = game.players.find(p => p.name === playerName);
        if (!player) {
            console.log(`Rescind request rejected for ${playerName} in ${gameCode}: Player not found`);
            return;
        }

        if (game.guesses[player.id]) {
            delete game.guesses[player.id];
            console.log(`Guess rescinded by ${playerName} (ID: ${player.id}) in ${gameCode} for round ${round}`);
        }
    });

    socket.on('startNewRound', (gameCode) => {
        const game = games[gameCode];
        if (game && game.state === 'playing') {
            console.log(`New round requested for ${gameCode}`);
            startRound(gameCode);
        } else {
            console.log(`Cannot start new round for ${gameCode}: Invalid state (${game?.state})`);
        }
    });

    socket.on('restartGame', (gameCode) => {
        const game = games[gameCode];
        if (!game || game.state !== 'ended') {
            console.log(`Cannot restart game ${gameCode}: Invalid state (${game?.state})`);
            return;
        }

        const activePlayers = game.players.filter(p => !p.disconnected);
        if (activePlayers.length <= 1) {
            io.to(gameCode).emit('gameTerminated', 'Not enough players to restart the game.');
            delete games[gameCode];
            console.log(`Game ${gameCode} terminated: Not enough players to restart (${activePlayers.length})`);
            return;
        }

        const roomSockets = io.sockets.adapter.rooms.get(gameCode);
        if (!roomSockets) {
            io.to(gameCode).emit('gameTerminated', 'No active connections to restart the game.');
            delete games[gameCode];
            console.log(`Game ${gameCode} terminated: No active sockets in room`);
            return;
        }

        activePlayers.forEach(player => {
            const socket = Array.from(roomSockets).find(sid => io.sockets.sockets.get(sid).id === player.id);
            if (!socket) {
                console.log(`Player ${player.name} not found in room, marking as disconnected`);
                player.disconnected = true;
            }
        });

        game.players = activePlayers.filter(p => !p.disconnected);
        if (game.players.length <= 1) {
            io.to(gameCode).emit('gameTerminated', 'Not enough players to restart after validation.');
            delete games[gameCode];
            console.log(`Game ${gameCode} terminated: Not enough players after validation (${game.players.length})`);
            return;
        }

        game.state = 'playing';
        game.round = 0;
        game.usedLocations = [];
        game.roundHistory = [];
        game.rejoinedPlayers = new Set();
        console.log(`Restarting game ${gameCode} with ${game.players.length} active players`);
        io.to(gameCode).emit('gameRestarted', {
            rounds: game.settings.rounds,
            area: game.settings.area,
            players: game.players
        });
        startRound(gameCode);
    });

    socket.on('leaveLobby', ({ gameCode }) => {
        const game = games[gameCode];
        if (!game || game.host === socket.id) return;
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1 && game.state === 'lobby') {
            const playerName = game.players[playerIndex].name;
            game.players.splice(playerIndex, 1);
            io.to(gameCode).emit('playerList', game.players);
            console.log(`Player ${playerName} (ID: ${socket.id}) left lobby ${gameCode}`);
            socket.leave(gameCode);
        }
    });

    socket.on('hostLeaveLobby', ({ gameCode }) => {
        const game = games[gameCode];
        if (game && game.host === socket.id && game.state === 'lobby') {
            socket.to(gameCode).emit('gameEnded', 'Host left the lobby');
            delete games[gameCode];
            console.log(`Game ${gameCode} ended due to host leaving lobby`);
            socket.leave(gameCode);
        }
    });

    socket.on('playerLeaveGame', ({ gameCode }) => {
        const game = games[gameCode];
        if (!game) return;

        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const playerName = game.players[playerIndex].name;
            console.log(`Player ${playerName} (ID: ${socket.id}) left game ${gameCode}`);

            if (game.state === 'ended') {
                io.to(gameCode).emit('gameTerminated', `Game ended because ${playerName} left before restart.`);
                delete games[gameCode];
                console.log(`Game ${gameCode} terminated due to player leaving in ended state`);
                socket.leave(gameCode);
            } else if (game.state === 'playing') {
                game.players[playerIndex].disconnected = true;
                io.to(gameCode).emit('playerList', game.players);
            }
        }
    });

    socket.on('disconnect', () => {
        for (const gameCode in games) {
            const game = games[gameCode];
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const playerName = game.players[playerIndex].name;
                console.log(`Player ${playerName} (ID: ${socket.id}) disconnected from ${gameCode}`);

                if (game.host === socket.id) {
                    if (game.state === 'lobby') {
                        delete games[gameCode];
                        io.to(gameCode).emit('gameEnded', 'Host disconnected');
                        console.log(`Game ${gameCode} deleted due to host disconnect in lobby`);
                    } else {
                        game.players[playerIndex].disconnected = true;
                        io.to(gameCode).emit('playerList', game.players);
                    }
                } else if (game.state === 'lobby') {
                    game.players.splice(playerIndex, 1);
                    io.to(gameCode).emit('playerList', game.players);
                    console.log(`Removed ${playerName} from ${gameCode} player list due to disconnect`);
                } else if (game.state === 'ended') {
                    io.to(gameCode).emit('gameTerminated', `Game ended because ${playerName} left before restart.`);
                    delete games[gameCode];
                    console.log(`Game ${gameCode} terminated due to player disconnect in ended state`);
                    socket.leave(gameCode);
                } else if (game.state === 'playing') {
                    game.players[playerIndex].disconnected = true;
                    io.to(gameCode).emit('playerList', game.players);
                }
                break;
            }
        }
    });
});

loadLocations();
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    const isLocal = !process.env.PORT;
    const url = isLocal ? `http://localhost:${PORT}` : `port ${PORT}`;
    console.log(`Server running on ${url}`);
});