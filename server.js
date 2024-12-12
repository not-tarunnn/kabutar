const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const Filter = require('bad-words'); // Import bad-words library

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const filter = new Filter(); // Initialize the profanity filter

// Serve the client-side code (ensure your HTML, CSS, JS are in the 'public' directory)
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms with users and messages
const rooms = {}; // { roomCode: { users: [], messages: [] } }

// Handle WebSocket connections
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

            // Notify the user that they joined the room
            ws.send(JSON.stringify({ type: 'info', text: `Joined room ${code}` }));
        } else if (type === 'message') {
            // Check for profanity
            if (filter.isProfane(text)) {
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        text: 'Inappropriate language detected. Please keep it clean!',
                    })
                );
                return; // Do not broadcast the profane message
            }

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

// Handle errors gracefully
server.on('error', (err) => {
    console.error('Server error:', err);
});

// Set the port to the environment variable provided by Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
