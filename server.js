// server.js
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocket.Server({ server });

// --- プレイヤー管理 ---
const players = new Map();
let nextPlayerId = 1;

// --- 部屋管理 ---
const rooms = {}; // roomId → { players: [] }
let nextRoomId = 1;

// --- 部屋にメッセージを送る ---
function broadcastToRoom(roomId, obj) {
  const data = JSON.stringify(obj);
  const room = rooms[roomId];
  if (!room) return;

  for (const pid of room.players) {
    const ws = players.get(pid);
    if (ws) ws.send(data);
  }
}

// --- WebSocket 接続 ---
wss.on("connection", ws => {
  const id = nextPlayerId++;
  players.set(id, ws);

  ws.send(JSON.stringify({ type: "welcome", id }));

  ws.on("message", raw => {
    const msg = JSON.parse(raw);

    // 部屋作成
    if (msg.type === "createRoom") {
      const roomName = msg.roomName;

      // すでに同名の部屋があればエラー
      if (rooms[roomName]) {
        ws.send(JSON.stringify({ type: "error", message: "その部屋名は使用されています" }));
        return;
      }

      rooms[roomName] = { players: [] };

      ws.send(JSON.stringify({
        type: "roomCreated",
        roomName
      }));
    }

    // 部屋参加
    const room = rooms[msg.roomName];
    if (!room) {
      ws.send(JSON.stringify({ type: "error", message: "部屋が存在しません" }));
      return;
    }

    room.players.push({ id, name: msg.name });

    ws.send(JSON.stringify({
      type: "playerList",
      players: room.players
    }));

    broadcastToRoom(msg.roomName, {
      type: "playerJoined",
      name: msg.name
    });
  }

    // 部屋退出
    if (msg.type === "leaveRoom") {
      const room = rooms[msg.roomId];
      if (!room) return;

      room.players = room.players.filter(pid => pid !== id);

      broadcastToRoom(msg.roomId, {
        type: "playerLeft",
        playerId: id
      });
    }
  });

  ws.on("close", () => {
    players.delete(id);
  });

});

// --- Render 用ポート ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

