#!/usr/bin/env node
const WebSocket = require('ws');
const readline = require('readline');
const crypto = require('crypto');
const { deriveKey, encrypt, decrypt } = require('./crypto');

const args = process.argv.slice(2);
const host = args[0] || 'localhost:8080';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log(`
 ██╗    ██╗███████╗     ██████╗██╗  ██╗ █████╗ ████████╗
 ██║    ██║██╔════╝    ██╔════╝██║  ██║██╔══██╗╚══██╔══╝
 ██║ █╗ ██║███████╗    ██║     ███████║███████║   ██║
 ██║███╗██║╚════██║    ██║     ██╔══██║██╔══██║   ██║
 ╚███╔███╔╝███████║    ╚██████╗██║  ██║██║  ██║   ██║
  ╚══╝╚══╝ ╚══════╝     ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
                    encrypted • secure • anonymous
`);

  const username = (await prompt('Username: ')).trim();
  if (!username) {
    console.error('Username cannot be empty');
    rl.close();
    process.exit(1);
  }

  const url = `ws://${host}?username=${encodeURIComponent(username)}`;
  const ws = new WebSocket(url);

  let encryptionKey = null;
  let currentRoom = null;
  let pendingJoin = null; // { roomName, key } — held until server confirms

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const time = new Date().toLocaleTimeString();

    switch (msg.type) {
      case 'connected':
        console.log(`\n${msg.text}`);
        console.log('Type /help for available commands.\n');
        break;

      case 'joined':
        if (pendingJoin?.roomName === msg.roomName) {
          encryptionKey = pendingJoin.key;
          pendingJoin = null;
        }
        currentRoom = msg.roomName;
        console.log(`\n[${time}] *** Joined room "${msg.roomName}" ***\n`);
        break;

      case 'room_created':
        console.log(`\n[${time}] *** Room "${msg.roomName}" created successfully ***\n`);
        break;

      case 'history': {
        console.log('--- Message History ---');
        for (const m of msg.messages) {
          const msgTime = new Date(m.timestamp).toLocaleTimeString();
          try {
            const plaintext = decrypt(encryptionKey, m.text);
            console.log(`[${msgTime}] ${m.username}: ${plaintext}`);
          } catch {
            console.log(`[${msgTime}] ${m.username}: [unable to decrypt message]`);
          }
        }
        console.log('--- End of History ---\n');
        break;
      }

      case 'system':
        console.log(`[${new Date(msg.timestamp).toLocaleTimeString()}] *** ${msg.text} ***`);
        break;

      case 'chat': {
        const msgTime = new Date(msg.timestamp).toLocaleTimeString();
        try {
          const plaintext = decrypt(encryptionKey, msg.text);
          console.log(`[${msgTime}] ${msg.username}: ${plaintext}`);
        } catch {
          console.log(`[${msgTime}] ${msg.username}: [unable to decrypt message]`);
        }
        break;
      }

      case 'room_deleted':
        console.log(`\n[${time}] *** Room "${msg.roomName}" has been deleted ***\n`);
        if (currentRoom === msg.roomName) {
          currentRoom = null;
          encryptionKey = null;
          console.log('You have been removed from the room. Use /join to join another.\n');
        }
        break;

      case 'rooms_list':
        if (msg.rooms.length === 0) {
          console.log('\nNo active rooms.\n');
        } else {
          console.log('\nActive rooms:');
          for (const room of msg.rooms) {
            console.log(`  ${room.name} (${room.occupancy} user${room.occupancy !== 1 ? 's' : ''})`);
          }
          console.log();
        }
        break;

      case 'error':
        pendingJoin = null;
        console.log(`\n[error] ${msg.text}\n`);
        break;
    }
  });

  ws.on('close', (code, reason) => {
    const message = reason?.toString() || 'Connection closed';
    console.log(`\nDisconnected: ${message} (code ${code})`);
    rl.close();
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error(`\nConnection error: ${err.message}`);
    rl.close();
    process.exit(1);
  });

  process.on('SIGINT', () => {
    ws.close();
    rl.close();
    process.exit(0);
  });

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return;

    if (!input.startsWith('/')) {
      if (!currentRoom) {
        console.log('[error] You must join a room first. Use /join <roomName> <password>');
        return;
      }
      ws.send(JSON.stringify({ type: 'chat', text: encrypt(encryptionKey, input) }));
      return;
    }

    const [command, ...cmdArgs] = input.split(' ');

    switch (command) {
      case '/join': {
        if (cmdArgs.length < 2) {
          console.log('Usage: /join <roomName> <password>');
          return;
        }
        const [roomName, password] = cmdArgs;
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        pendingJoin = { roomName, key: deriveKey(password) };
        ws.send(JSON.stringify({ type: 'join', roomName, passwordHash }));
        break;
      }

      case '/create': {
        if (cmdArgs.length < 2) {
          console.log('Usage: /create <roomName> <roomPassword>');
          return;
        }
        const [roomName, roomPassword] = cmdArgs;
        const adminPassword = (await prompt('Admin password: ')).trim();
        if (!adminPassword) {
          console.log('[error] Admin password cannot be empty');
          return;
        }
        const roomPasswordHash = crypto.createHash('sha256').update(roomPassword).digest('hex');
        const adminPasswordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');
        ws.send(JSON.stringify({ type: 'create', roomName, roomPasswordHash, adminPasswordHash }));
        break;
      }

      case '/rooms': {
        const adminPassword = (await prompt('Admin password: ')).trim();
        if (!adminPassword) {
          console.log('[error] Admin password cannot be empty');
          return;
        }
        const adminPasswordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');
        ws.send(JSON.stringify({ type: 'list_rooms', adminPasswordHash }));
        break;
      }

      case '/delete': {
        if (cmdArgs.length < 1) {
          console.log('Usage: /delete <roomName>');
          return;
        }
        const [roomName] = cmdArgs;
        const adminPassword = (await prompt('Admin password: ')).trim();
        if (!adminPassword) {
          console.log('[error] Admin password cannot be empty');
          return;
        }
        const adminPasswordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');
        ws.send(JSON.stringify({ type: 'delete', roomName, adminPasswordHash }));
        break;
      }

      case '/logout':
        console.log('Logging out...');
        ws.close();
        rl.close();
        process.exit(0);
        break;

      case '/help':
        console.log('\nAvailable commands:');
        console.log('  /join <roomName> <password>    Join a room');
        console.log('  /create <roomName> <password>  Create a room (admin only)');
        console.log('  /delete <roomName>             Delete a room (admin only)');
        console.log('  /rooms                         List all active rooms (admin only)');
        console.log('  /logout                        Leave the chat and exit');
        console.log('  /help                          Show this help\n');
        break;

      default:
        console.log(`Unknown command: ${command}. Type /help for available commands.`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
