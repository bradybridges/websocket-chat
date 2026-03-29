const { WebSocketServer } = require('ws');
const http = require('http');
const { parse } = require('url');

const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_PASSWORD_HASH) {
  console.error('ADMIN_PASSWORD_HASH environment variable is required');
  process.exit(1);
}

// Global username registry to enforce uniqueness across all rooms
const activeUsernames = new Set();

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// rooms: Map<roomName, { passwordHash: string, clients: Map<username, ws>, messages: Array }>
const rooms = new Map();

const server = http.createServer();
const wss = new WebSocketServer({ server });

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToRoom(roomName, message) {
  const room = rooms.get(roomName);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const [, ws] of room.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url, true);
  const username = query.username?.trim();

  if (!username) {
    send(ws, { type: 'error', text: 'Username is required' });
    ws.close(4001, 'Username is required');
    return;
  }

  if (activeUsernames.has(username)) {
    send(ws, { type: 'error', text: 'Username already taken' });
    ws.close(4002, 'Username already taken');
    return;
  }

  activeUsernames.add(username);
  let currentRoom = null;

  console.log(`[+] ${username} connected`);
  send(ws, {
    type: 'connected',
    text: `Welcome, ${username}. Use /join <room> <password> to join a room.`,
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', text: 'Invalid message format' });
      return;
    }

    if (msg.type === 'join') {
      const { roomName, passwordHash } = msg;

      if (!roomName || !passwordHash) {
        send(ws, { type: 'error', text: 'Room name and password are required' });
        return;
      }

      const room = rooms.get(roomName);
      if (!room) {
        send(ws, { type: 'error', text: `Room "${roomName}" does not exist` });
        return;
      }

      if (passwordHash !== room.passwordHash) {
        send(ws, { type: 'error', text: 'Invalid room password' });
        return;
      }

      // Leave current room if already in one
      if (currentRoom) {
        const prev = rooms.get(currentRoom);
        if (prev) {
          prev.clients.delete(username);
          broadcastToRoom(currentRoom, {
            type: 'system',
            text: `${username} left the room`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      currentRoom = roomName;
      room.clients.set(username, ws);

      send(ws, { type: 'joined', roomName });

      if (room.messages.length > 0) {
        send(ws, { type: 'history', messages: room.messages });
      }

      broadcastToRoom(roomName, {
        type: 'system',
        text: `${username} joined the room`,
        timestamp: new Date().toISOString(),
      });

      console.log(`[>] ${username} joined room "${roomName}" (${room.clients.size} in room)`);
      return;
    }

    if (msg.type === 'create') {
      const { roomName, roomPasswordHash, adminPasswordHash } = msg;

      if (!roomName || !roomPasswordHash || !adminPasswordHash) {
        send(ws, { type: 'error', text: 'Room name, room password, and admin password are required' });
        return;
      }

      if (adminPasswordHash !== ADMIN_PASSWORD_HASH) {
        send(ws, { type: 'error', text: 'Invalid admin password' });
        return;
      }

      if (rooms.has(roomName)) {
        send(ws, { type: 'error', text: `Room "${roomName}" already exists` });
        return;
      }

      rooms.set(roomName, { passwordHash: roomPasswordHash, clients: new Map(), messages: [] });
      console.log(`[*] Room "${roomName}" created by ${username}`);
      send(ws, { type: 'room_created', roomName });
      return;
    }

    if (msg.type === 'list_rooms') {
      const { adminPasswordHash } = msg;

      if (!adminPasswordHash) {
        send(ws, { type: 'error', text: 'Admin password is required' });
        return;
      }

      if (adminPasswordHash !== ADMIN_PASSWORD_HASH) {
        send(ws, { type: 'error', text: 'Invalid admin password' });
        return;
      }

      const roomList = Array.from(rooms.entries()).map(([name, room]) => ({
        name,
        occupancy: room.clients.size,
      }));

      send(ws, { type: 'rooms_list', rooms: roomList });
      return;
    }

    if (msg.type === 'delete') {
      const { roomName, adminPasswordHash } = msg;

      if (!roomName || !adminPasswordHash) {
        send(ws, { type: 'error', text: 'Room name and admin password are required' });
        return;
      }

      if (adminPasswordHash !== ADMIN_PASSWORD_HASH) {
        send(ws, { type: 'error', text: 'Invalid admin password' });
        return;
      }

      if (!rooms.has(roomName)) {
        send(ws, { type: 'error', text: `Room "${roomName}" does not exist` });
        return;
      }

      // Notify all clients in the room before deleting it
      broadcastToRoom(roomName, {
        type: 'room_deleted',
        roomName,
        timestamp: new Date().toISOString(),
      });

      rooms.delete(roomName);
      console.log(`[x] Room "${roomName}" deleted by ${username}`);
      send(ws, { type: 'room_deleted', roomName });
      return;
    }

    if (msg.type === 'online') {
      if (!currentRoom) {
        send(ws, { type: 'error', text: 'You are not in a room' });
        return;
      }

      const room = rooms.get(currentRoom);
      const users = room ? Array.from(room.clients.keys()) : [];
      send(ws, { type: 'online_list', users });
      return;
    }

    if (msg.type === 'leave') {
      if (!currentRoom) {
        send(ws, { type: 'error', text: 'You are not in a room' });
        return;
      }

      const room = rooms.get(currentRoom);
      if (room) {
        room.clients.delete(username);
        broadcastToRoom(currentRoom, {
          type: 'system',
          text: `${username} left the room`,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`[<] ${username} left room "${currentRoom}"`);
      send(ws, { type: 'left', roomName: currentRoom });
      currentRoom = null;
      return;
    }

    if (msg.type === 'chat') {
      if (!currentRoom) {
        send(ws, { type: 'error', text: 'You must join a room before sending messages. Use /join <room> <password>' });
        return;
      }

      if (!msg.text?.trim()) return;

      const room = rooms.get(currentRoom);
      const timestamp = new Date().toISOString();

      room.messages.push({ username, text: msg.text, timestamp });

      const cutoff = Date.now() - FOUR_HOURS_MS;
      room.messages = room.messages.filter(m => new Date(m.timestamp).getTime() > cutoff);

      broadcastToRoom(currentRoom, { type: 'chat', username, text: msg.text, timestamp });
      return;
    }
  });

  ws.on('close', () => {
    activeUsernames.delete(username);
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.clients.delete(username);
        broadcastToRoom(currentRoom, {
          type: 'system',
          text: `${username} left the room`,
          timestamp: new Date().toISOString(),
        });
        console.log(`[-] ${username} disconnected from room "${currentRoom}" (${room.clients.size} in room)`);
        return;
      }
    }
    console.log(`[-] ${username} disconnected`);
  });

  ws.on('error', (err) => {
    console.error(`Error from ${username}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket chat server running on port ${PORT}`);
});
