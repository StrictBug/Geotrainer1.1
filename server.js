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
            const [name, lat, lng, area] = row.split(',');
            return { name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng), area: area.trim() };
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
    let availableLocations = locations.filter(loc => 
        !game.usedLocations?.includes(loc) && (area === 'All regions' || loc.area === area)
    );
    if (availableLocations.length === 0) {
        game.usedLocations = [];
        availableLocations = locations.filter(loc => area === 'All regions' || loc.area === area);
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
        if (!game.roundEnded && (game.timeLeft < 0 || Object.keys(game.guesses).length === game.players.length)) {
            clearInterval(timer);
            endRound(gameCode);
        }
    }, 1000);
    game.timer = timer;
}

function endRound(gameCode) {
    const game = games[gameCode];
    if (!game || game.state !== 'playing' || game.roundEnded) return;
    game.roundEnded = true;

    const results = game.players.map(player => {
        const guess = game.guesses[player.id];
        let distance = null, points = 0;
        if (guess) {
            const actual = { lat: game.currentLocation.lat, lng: game.currentLocation.lng };
            distance = haversineDistance(guess, actual);
            points = distance <= 5 ? 1000 : distance >= 100 ? 0 : Math.floor(1000 - ((distance - 5) * (1000 / 95)));
            player.score = (player.score || 0) + points;
            console.log(`Score for ${player.name}: +${points}, total=${player.score}`);
        }
        return { name: player.name, guess, distance, points, totalScore: player.score };
    });

    game.roundHistory = game.roundHistory || [];
    game.roundHistory.push({
        round: game.round,
        location: game.currentLocation.name,
        scores: results.map(r => ({ name: r.name, points: r.points }))
    });

    console.log(`Round ${game.round} ended in ${gameCode}`);
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

function haversineDistance(coord1, coord2) {
    const R = 6371;
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('hostGame', ({ rounds, area, hostName }) => {
        const gameCode = generateGameCode();
        games[gameCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: hostName, ready: false, score: 0, disconnected: false }],
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
        games[gameCode].players.push({ id: socket.id, name: playerName, ready: false, score: 0, disconnected: false });
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
                player.disconnected = false; // Reset disconnected status
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

    socket.on('submitGuess', ({ gameCode, guess }) => {
        const game = games[gameCode];
        if (game && game.state === 'playing' && !game.roundEnded && !game.guesses[socket.id]) {
            game.guesses[socket.id] = guess;
            console.log(`Guess submitted by ${socket.id} in ${gameCode} at ${game.timeLeft}s`);
            if (Object.keys(game.guesses).length === game.players.length && game.timeLeft >= 0) {
                clearInterval(game.timer);
                endRound(gameCode);
            }
        } else {
            console.log(`Guess rejected for ${socket.id} in ${gameCode}: Round ended or already guessed`);
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

        // Filter out disconnected players and update with current socket IDs
        const activePlayers = game.players.filter(p => !p.disconnected);
        if (activePlayers.length <= 1) {
            io.to(gameCode).emit('gameTerminated', 'Not enough players to restart the game.');
            delete games[gameCode];
            console.log(`Game ${gameCode} terminated: Not enough players to restart (${activePlayers.length})`);
            return;
        }

        // Update player IDs based on currently connected sockets in the room
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
        game.players.forEach(player => player.score = 0);
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
server.listen(PORT, () => {
    const isLocal = !process.env.PORT; // If process.env.PORT is undefined, we're running locally
    const url = isLocal ? `http://localhost:${PORT}` : `port ${PORT}`;
    console.log(`Server running on ${url}`);
});