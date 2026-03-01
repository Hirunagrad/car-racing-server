const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);

    // --- NEW: Accepting playerName on create ---
    socket.on('createRoom', (data) => {
        const roomId = generateRoomCode();
        socket.join(roomId);
        
        rooms[roomId] = {
            id: roomId, host: socket.id, state: 'lobby', players: {}
        };
        
        rooms[roomId].players[socket.id] = {
            id: socket.id, isHost: true, carIndex: data.carIndex, playerName: data.playerName || "HOST",
            x: -80, z: 20, rotation: Math.PI, speed: 0, turnDir: 0, 
            isBoosting: false, isSkidding: false, finished: false, finishTime: 0,
            laps: 0, checkpoint: 0
        };

        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('lobbyUpdated', Object.values(rooms[roomId].players));
    });

    // --- NEW: Accepting playerName on join ---
    socket.on('joinRoom', (data) => {
        const roomId = data.roomId.toUpperCase();
        if (rooms[roomId] && rooms[roomId].state === 'lobby') {
            socket.join(roomId);
            rooms[roomId].players[socket.id] = {
                id: socket.id, isHost: false, carIndex: data.carIndex, playerName: data.playerName || "PLAYER",
                x: -80, z: 20, rotation: Math.PI, speed: 0, turnDir: 0, 
                isBoosting: false, isSkidding: false, finished: false, finishTime: 0,
                laps: 0, checkpoint: 0
            };
            socket.emit('roomJoined', roomId);
            io.to(roomId).emit('lobbyUpdated', Object.values(rooms[roomId].players));
        } else {
            socket.emit('roomError', 'Room not found or game already started!');
        }
    });

    socket.on('startGame', (roomId) => {
        if (rooms[roomId] && rooms[roomId].host === socket.id) {
            rooms[roomId].state = 'racing';
            io.to(roomId).emit('gameStarted', Object.values(rooms[roomId].players));
        }
    });

    socket.on('playerMovement', (data) => {
        const roomId = data.roomId;
        if (!rooms[roomId] || !rooms[roomId].players[socket.id] || isNaN(data.x)) return;

        let p = rooms[roomId].players[socket.id];
        p.x = data.x; p.z = data.z; p.rotation = data.rotation;
        p.speed = data.speed; p.turnDir = data.turnDir;
        p.isBoosting = data.isBoosting; p.isSkidding = data.isSkidding;
        p.laps = data.laps || 0; 
        p.checkpoint = data.checkpoint || 0; 

        socket.to(roomId).emit('playerMoved', p);
    });

    socket.on('playerFinished', (data) => {
        const roomId = data.roomId;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].finished = true;
            rooms[roomId].players[socket.id].finishTime = data.finishTime;
            socket.to(roomId).emit('playerFinished', rooms[roomId].players[socket.id]);
        }
    });

    const handleLeave = () => {
        for (let roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                socket.leave(roomId);
                io.to(roomId).emit('playerDisconnected', socket.id);
                io.to(roomId).emit('lobbyUpdated', Object.values(rooms[roomId].players));
                
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                } else if (rooms[roomId].host === socket.id) {
                    const newHostId = Object.keys(rooms[roomId].players)[0];
                    rooms[roomId].host = newHostId;
                    rooms[roomId].players[newHostId].isHost = true;
                    io.to(roomId).emit('lobbyUpdated', Object.values(rooms[roomId].players));
                }
                break;
            }
        }
    };

    socket.on('leaveRoom', handleLeave);
    socket.on('disconnect', handleLeave);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 Lobby Server running on port ${PORT}`); });