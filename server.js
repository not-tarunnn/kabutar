// Import necessary modules
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve the client-side code
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms with users and messages
const rooms = {}; // { roomCode: { users: [], messages: [] } }

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const { type, code, text } = data;

        if (type === 'join') {
            // Join room logic
            if (!rooms[code]) rooms[code] = { users: [], messages: [] };
            rooms[code].users.push(ws);
            ws.roomCode = code;

            // Send chat history to the user
            ws.send(JSON.stringify({ type: 'history', messages: rooms[code].messages }));

            ws.send(JSON.stringify({ type: 'info', text: `Joined room ${code}` }));
        } else if (type === 'message') {
            // Save the message and broadcast to all in the room
            const room = rooms[ws.roomCode];
            if (room) {
                const messageObject = { text, sender: 'self' };
                room.messages.push(messageObject);

                room.users.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(
                            JSON.stringify({ type: 'message', text, sender: ws === client ? 'self' : 'other' })
                        );
                    }
                });
            }
        }
    });

    ws.on('close', () => {
        // Remove user from room on disconnect
        const room = rooms[ws.roomCode];
        if (room) {
            room.users = room.users.filter((client) => client !== ws);
            if (room.users.length === 0) delete rooms[ws.roomCode];
        }
    });
});

// Render requires specifying the port from an environment variable
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
