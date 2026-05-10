// server.js
const http = require("http");
const WebSocket = require("ws");

// --- HTTP サーバー（Render がポートを検出するために必要） ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

// --- WebSocket サーバー ---
const wss = new WebSocket.Server({ server });

// --- 接続処理 ---
wss.on("connection", ws => {
  console.log("Client connected");

  ws.send("接続成功！");

  ws.on("message", msg => {
    console.log("受信:", msg);
    ws.send("echo: " + msg);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// --- Render 用ポート ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
