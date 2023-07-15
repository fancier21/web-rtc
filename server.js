import WebSocket, { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 5000 });

// Store connected clients
const clients = new Set();

// Event listener for WebSocket connection
wss.on('connection', (ws) => {
  // Add client to the set
  clients.add(ws);

  // Event listener for receiving messages
  ws.on('message', (message) => {
    const msg = JSON.parse(message);
    console.log('Message', msg)

    // Broadcast the received message to all clients except the sender
    broadcastMessage(msg, ws);
  });

  // Event listener for closing connection
  ws.on('close', () => {
    // Remove client from the set
    clients.delete(ws);
  });
});

// Function to broadcast a message to all clients except the sender
function broadcastMessage(message, sender) {
  clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
