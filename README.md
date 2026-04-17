# ws-chat

Encrypted, anonymous group chat over WebSocket. Messages are end-to-end encrypted  the server only ever sees ciphertext and has no access to message content.

## Features

- **End-to-end encryption**  AES-256-GCM with per-message random IVs; keys derived client-side via PBKDF2 and never transmitted
- **Multi-room**  create isolated rooms, each with its own password and encryption key
- **Ephemeral**  no database; all state is in-memory and does not persist across server restarts
- **Anonymous**  no accounts or registration; pick a username on connect
- **CLI client**  installable as a global npm package (`ws-chat`)
- **Small & Easily Self-Hosted**  single Docker container, minimal dependencies

## Security model

- **Server is zero-knowledge**  message text is encrypted before it leaves the client; the server stores and relays ciphertext only
- **Key derivation**  room passwords are never transmitted directly; a 256-bit AES key is derived client-side from the room password using PBKDF2 (100,000 iterations, SHA-256)
- **Password hashing**  room and admin passwords are hashed with SHA-256 on the client before being sent to the server for access control; plaintext passwords never leave the client
- **Authenticated encryption**  AES-256-GCM provides both confidentiality and integrity; tampered ciphertext will fail to decrypt
- **Message history**  stored per-room as ciphertext; purged after 4 hours; delivered to joining clients who can decrypt it locally

## Repository structure

```
websocket-chat/
├── server/               # WebSocket server (Node.js)
│   ├── Dockerfile
│   ├── package.json
│   └── src/server.js
├── client/               # CLI chat client (Node.js)
│   ├── package.json
│   └── src/
│       ├── client.js     # Interactive CLI
│       └── crypto.js     # AES-256-GCM encrypt/decrypt
├── docker-compose.yml
└── .env.example
```

## Installation

### Run directly

```bash
cd client
npm install
node src/client.js [host]
```

### Install globally

```bash
cd client
npm install
npm install -g .
```

Once installed globally, run from anywhere:

```bash
ws-chat [host]
```

## Connecting

```bash
ws-chat                    # connect to localhost:8080
ws-chat example.com:8080   # connect to a remote server
```

On launch you will be prompted for a username, then connected to the server. Use `/help` to see available commands.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_PASSWORD_HASH` | Yes | n/a | SHA-256 hash of the admin password |
| `PORT` | No | `8080` | Port the server listens on |

Generate the admin password hash:

```bash
node -e "const c=require('crypto');console.log(c.createHash('sha256').update('yourpassword').digest('hex'))"
```

## Further reading

- [`server/README.md`](server/README.md)  WebSocket message protocol, connection flow, close codes
- [`client/README.md`](client/README.md)  slash command reference, example session, encryption details
