// server.js
import WebSocket, { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

wss.on("connection", ws => {
  ws.send("connected");

  ws.on("message", msg => {
    // 全員に送信（ブロードキャスト）
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg.toString());
      }
    });
  });
});
