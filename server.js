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

      // 全員に最新一覧を送信
      broadcast({
        type: "playerList",
        players: players.map(p => ({ name: p.name }))
      });
    }
  });

  ws.on("close", () => {
    // 切断したプレイヤーを削除
    players = players.filter(p => p.ws !== ws);

    broadcast({
      type: "playerList",
      players: players.map(p => ({ name: p.name }))
    });
  });
});

// --- 全員に送信 ---
function broadcast(obj) {
  const data = JSON.stringify(obj);
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
