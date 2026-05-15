const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  let filePath = req.url.split('?')[0];
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  const ext = path.extname(filePath);
  const fullPath = path.join(__dirname, filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'text/javascript';
    if (ext === '.css') contentType = 'text/css';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

let nextId = 1;
const clients = new Map(); // ws -> {id, name}
let roomPlayers = [];      // {id, name}
let gameState = null;      // {players:[{id,name,position,score,hand}], turnIndex, turnNumber, isFinished}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastRoomState() {
  broadcast({
    type: 'room_state',
    players: roomPlayers
  });
}

function initGame() {
  gameState = {
    players: roomPlayers.map(p => ({
      id: p.id,
      name: p.name,
      position: 0, // 0:スタート, 1-9, 10:ゴール
      score: 0,
      hand: drawHand()
    })),
    turnIndex: 0,
    turnNumber: 1,
    isFinished: false
  };
  // 最初のターンプレイヤーをランダムに
  if (gameState.players.length > 0) {
    gameState.turnIndex = Math.floor(Math.random() * gameState.players.length);
  }
}

function drawHand() {
  const hand = [];
  for (let i = 0; i < 5; i++) {
    hand.push(1 + Math.floor(Math.random() * 4)); // 1~4
  }
  return hand;
}

function sendGameState() {
  broadcast({
    type: 'game_state',
    state: gameState
  });
}

function handlePlayCard(playerId, cardIndex) {
  if (!gameState || gameState.isFinished) return;
  const current = gameState.players[gameState.turnIndex];
  if (!current || current.id !== playerId) return;

  if (cardIndex < 0 || cardIndex >= current.hand.length) return;

  const value = current.hand[cardIndex];
  current.hand.splice(cardIndex, 1);

  // 位置更新
  const boardSize = 11; // 0:スタート,1-9,10:ゴール
  let pos = current.position;
  for (let i = 0; i < value; i++) {
    pos++;
    if (pos >= boardSize) {
      pos = 0; // スタートに戻る
      current.score += 1; // ゴール通過で得点
    }
  }
  current.position = pos;

  // 勝利判定
  if (current.score >= 3) {
    gameState.isFinished = true;
    broadcast({
      type: 'game_over',
      winner: { id: current.id, name: current.name },
      state: gameState
    });
    return;
  }

  sendGameState();
}

function handleEndTurn(playerId) {
  if (!gameState || gameState.isFinished) return;
  const current = gameState.players[gameState.turnIndex];
  if (!current || current.id !== playerId) return;

  // 手札を捨てて新しく5枚
  current.hand = drawHand();

  // 次のプレイヤーへ
  gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
  gameState.turnNumber += 1;

  sendGameState();
}

wss.on('connection', (ws) => {
  const id = String(nextId++);
  clients.set(ws, { id, name: null });

  ws.send(JSON.stringify({ type: 'assign_id', id }));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'join_room') {
      const client = clients.get(ws);
      client.name = msg.name;
      if (!roomPlayers.find(p => p.id === client.id)) {
        roomPlayers.push({ id: client.id, name: client.name });
      }
      broadcastRoomState();
    }

    if (msg.type === 'leave_room') {
      const client = clients.get(ws);
      roomPlayers = roomPlayers.filter(p => p.id !== client.id);
      broadcastRoomState();
    }

    if (msg.type === 'request_start_game') {
      if (!roomPlayers.length) return;
      initGame();
      broadcast({ type: 'game_start' });
      sendGameState();
    }

    if (msg.type === 'join_game') {
      // 特に何もしなくてもOK（状態はbroadcastで送る）
      if (gameState) {
        ws.send(JSON.stringify({
          type: 'game_state',
          state: gameState
        }));
      }
    }

    if (msg.type === 'leave_game') {
      // 今回は特に処理しない（簡易実装）
    }

    if (msg.type === 'play_card') {
      handlePlayCard(msg.id, msg.cardIndex);
    }

    if (msg.type === 'end_turn') {
      handleEndTurn(msg.id);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      roomPlayers = roomPlayers.filter(p => p.id !== client.id);
      broadcastRoomState();
    }
    clients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
