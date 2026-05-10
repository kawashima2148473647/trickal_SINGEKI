// server.js
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocket.Server({ server });

// --- プレイヤー一覧 ---
let players = [];

wss.on("connection", ws => {
  ws.on("message", data => {
    const msg = JSON.parse(data);

    // --- join を受け取る ---
    if (msg.type === "join") {
      players.push({ name: msg.name, ws });

      sendPlayerList();
    }
  });

  ws.on("close", () => {
    players = players.filter(p => p.ws !== ws);
    sendPlayerList();
  });
});

// --- 全員に一覧を送る ---
function sendPlayerList() {
  const list = players.map(p => ({ name: p.name }));

  const data = JSON.stringify({
    type: "playerList",
    players: list
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
