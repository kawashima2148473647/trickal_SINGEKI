// server.js
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  console.log("Client connected");

  ws.on("message", msg => {
    console.log("received:", msg);
    ws.send("echo: " + msg);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// ★ Render が割り当てるポートを必ず使う
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
