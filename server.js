// 既存の先頭部分はそのまま
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocket.Server({ server });

// --- ルーム管理を追加 ---
const rooms = {
  default: {
    players: [], // { name, ws }
    deck: [],
    hands: {},   // name -> [cards]
    table: [],
    turnIndex: 0
  }
};

// --- ユーティリティ ---
function createDeck() {
  // 簡易デッキ（例: 1..52 を文字列で表現）
  const deck = [];
  for (let i = 1; i <= 52; i++) deck.push(String(i));
  return deck;
}

function broadcastRoom(roomId, msg) {
  const room = rooms[roomId];
  if (!room) return;
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(msg));
    }
  });
}

function sendToPlayer(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// --- プレイヤー一覧 ---
// players 配列は legacy のまま残すが、rooms.default.players を主に使う
let players = [];

wss.on("connection", ws => {
  ws.on("message", data => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      console.error("Invalid JSON:", data);
      return;
    }

    // join を受け取る
    if (msg.type === "join" && msg.name) {
      // 既存の players と rooms の両方に登録
      players.push({ name: msg.name, ws });
      const room = rooms.default;
      // 既に同名があれば差し替え
      const existing = room.players.find(p => p.name === msg.name);
      if (existing) {
        existing.ws = ws;
      } else {
        room.players.push({ name: msg.name, ws });
      }

      // 既存の playerList 送信（簡易）
      sendPlayerList();
    }

    // rejoin: ページ遷移後に状態を再送してほしいとき
    if (msg.type === "rejoin" && msg.name) {
      const room = rooms.default;
      const p = room.players.find(x => x.name === msg.name);
      if (p) p.ws = ws; // ws を差し替え
      // 自分の手札を個別送信（あれば）
      if (room.hands[msg.name]) {
        sendToPlayer(ws, { type: "deal", hand: room.hands[msg.name], deckCount: room.deck.length });
      }
      // 全体の gameState も送る
      sendGameState(room);
      sendPlayerList();
    }

    // startGame を受け取る（誰でも押せる簡易実装）
    if (msg.type === "startGame") {
      startGame("default");
    }

    // playCard を受け取る
    if (msg.type === "playCard" && msg.from && msg.card) {
      handlePlay("default", msg.from, msg.card);
    }
  });

  ws.on("close", () => {
    players = players.filter(p => p.ws !== ws);
    // rooms 側もクリーンアップ
    const room = rooms.default;
    room.players = room.players.filter(p => p.ws !== ws);
    sendPlayerList();
  });
});

// --- playerList を全員に送る ---
function sendPlayerList() {
  const list = rooms.default.players.map(p => ({ name: p.name }));
  const data = JSON.stringify({ type: "playerList", players: list });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

// --- ゲーム開始処理 ---
function startGame(roomId = "default") {
  if (!room.players || room.players.length === 0) {
    console.warn("startGame aborted: no players");
    return;
  }
  room.turnIndex = room.turnIndex % room.players.length;

  const room = rooms[roomId];
  room.deck = createDeck().sort(() => Math.random() - 0.5);
  room.table = [];
  room.hands = {};
  room.turnIndex = 0;

  const HAND_SIZE = 5; // 例: 5枚配る
  room.players.forEach((p) => {
    room.hands[p.name] = room.deck.splice(0, HAND_SIZE);
    // 各プレイヤーに自分の手札だけ送信
    sendToPlayer(p.ws, { type: "deal", hand: room.hands[p.name], deckCount: room.deck.length });
  });

  // 全体に gameState を送る（手札は含めない）
  sendGameState(room);
}

// --- gameState を全員に送る ---
function sendGameState(room) {
  // 安全に turn を決める
  const turnName = (room.players && room.players.length > 0 && room.players[room.turnIndex])
    ? room.players[room.turnIndex].name
    : null;

  const state = {
    type: "gameState",
    turn: room.players[room.turnIndex] ? room.players[room.turnIndex].name : null,
    table: room.table,
    handsCount: Object.fromEntries(room.players.map(p => [p.name, (room.hands[p.name] || []).length])),
    deckCount: room.deck.length
  };
  broadcastRoom("default", state);
}

// --- プレイ処理 ---
function handlePlay(roomId, playerName, card) {
  const room = rooms[roomId];
  const current = room.players[room.turnIndex];
  if (!current || current.name !== playerName) {
    // 該当プレイヤーにエラーを返す
    const p = room.players.find(x => x.name === playerName);
    if (p) sendToPlayer(p.ws, { type: "invalid", reason: "not your turn" });
    return;
  }

  const hand = room.hands[playerName] || [];
  const idx = hand.indexOf(card);
  if (idx === -1) {
    const p = room.players.find(x => x.name === playerName);
    if (p) sendToPlayer(p.ws, { type: "invalid", reason: "card not in hand" });
    return;
  }

  // カードを場に出す
  hand.splice(idx, 1);
  room.table.push({ player: playerName, card });
  // ターンを進める
  room.turnIndex = (room.turnIndex + 1) % room.players.length;

  // 更新を全員へ送る
  // 各プレイヤーには自分の手札を個別送信
  room.players.forEach(p => {
    sendToPlayer(p.ws, { type: "deal", hand: room.hands[p.name], deckCount: room.deck.length });
  });
  sendGameState(room);

  room.turnIndex = room.players.length > 0 ? room.turnIndex % room.players.length : 0;

}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
