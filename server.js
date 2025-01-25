const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve the client-side code (ensure your HTML, CSS, JS are in the 'public' directory)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse incoming JSON data
app.use(express.json());  // This is necessary for parsing JSON requests


// POST endpoint to receive location data
app.post('/api/location', (req, res) => {
    // Destructure the latitude and longitude from the request body
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and Longitude are required' });
    }

    // Log the received location data to the console
    console.log(`Received location: Latitude ${latitude}, Longitude ${longitude}`);

    // Respond to the client with a success message
    res.json({ message: 'Location received successfully!' });
});

// Store rooms with users and messages
const rooms = {}; // { roomCode: { users: [], messages: [] } }

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
  });
}

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

            // Notify all users that a new user has joined
            const joinMessage = `User ${ws._socket.remoteAddress} has joined the room.`;
            rooms[code].users.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client !== ws) {
                    client.send(JSON.stringify({ type: 'message', text: joinMessage, sender: 'system' }));
                }
            });

            // Notify the user that they joined the room
            ws.send(JSON.stringify({ type: 'info', text: `Joined room ${code}` }));
        } else if (type === 'message') {
            // Save the message and broadcast to all users except the sender
            const room = rooms[ws.roomCode];
            if (room) {
                const messageObject = { text, sender: 'self' };
                room.messages.push(messageObject);

                room.users.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client !== ws) {
                        client.send(
                            JSON.stringify({ type: 'message', text, sender: 'other' })
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

            // Notify others that the user left the room
            if (room.users.length > 0) {
                const leaveMessage = `User ${ws._socket.remoteAddress} has left the room.`;
                room.users.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'message', text: leaveMessage, sender: 'system' }));
                    }
                });
            } else {
                delete rooms[ws.roomCode]; // Clean up room if no users are left
            }
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
