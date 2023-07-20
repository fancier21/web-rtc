import WebSocket, { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", function (ws) {
    ws.on("message", function (message) {
        // Broadcast any received message to all clients
        console.log("received: %s", message);
        wss.broadcast(message);
    });

    ws.on("error", () => ws.terminate());
});

wss.broadcast = function (data) {
    this.clients.forEach(function (client) {
        if (client.readyState === WebSocket.OPEN) {
            const d = JSON.parse(data.toString());
            client.send(JSON.stringify(d));
        }
    });
};
