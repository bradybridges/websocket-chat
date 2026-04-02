# ws-chat server

WebSocket chat server built with Node.js and the `ws` package. Supports multiple rooms, per-room passwords, AES-256-GCM end-to-end encrypted messages, and admin-controlled room management. All message content is relayed as ciphertext — the server never has access to plaintext.

## Requirements

- Docker and Docker Compose

## Configuration

The server is configured via environment variables.

| Variable | Required | Description |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | Yes | SHA-256 hash of the admin password |
| `PORT` | No | Port to listen on (default: `8080`) |

### Generating the admin password hash

```bash
node -e "const c=require('crypto');console.log(c.createHash('sha256').update('yourpassword').digest('hex'))"
```

### Using a `.env` file

Create a `.env` file in the project root (never commit this):

```
ADMIN_PASSWORD_HASH=your-hash-here
```

Docker Compose will pick it up automatically.

## Running the server

```bash
# First run (builds the image)
docker compose up --build

# Subsequent runs
docker compose up

# Run in background
docker compose up -d

# Stop the server
docker compose down
```

The server will log connections, room events, and errors to stdout:

```
WebSocket chat server running on port 8080
[+] alice connected
[>] alice joined room "general" (1 in room)
[+] bob connected
[>] bob joined room "general" (2 in room)
[-] bob disconnected from room "general" (1 in room)
```

## Architecture

### Connection flow

1. Client connects via WebSocket with `?username=<name>` in the query string
2. Server validates the username is present and unique
3. Server sends a `connected` message — the client is now connected but not in any room
4. Client sends a `join` or `create` message to enter a room

### Rooms

Rooms are stored in memory and do not persist across server restarts. Each room holds:
- A SHA-256 password hash for access control
- A map of connected clients
- An array of recent messages (ciphertext, purged after 4 hours)

### Message history

When a user joins a room, the server sends all stored messages for that room as a `history` message. Messages older than 4 hours are purged on each new message posted.

### End-to-end encryption

The server stores and relays message text as AES-256-GCM ciphertext. Encryption keys are derived client-side from room passwords using PBKDF2 and never transmitted to the server.

## WebSocket message protocol

All messages are JSON.

### Client → Server

| `type` | Fields | Description |
|---|---|---|
| `join` | `roomName`, `passwordHash` | Join a room |
| `create` | `roomName`, `roomPasswordHash`, `adminPasswordHash` | Create a room |
| `delete` | `roomName`, `adminPasswordHash` | Delete a room |
| `list_rooms` | `adminPasswordHash` | List all rooms |
| `online` | — | List users in current room |
| `leave` | — | Leave the current room |
| `chat` | `text` | Send an encrypted message |

### Server → Client

| `type` | Fields | Description |
|---|---|---|
| `connected` | `text` | Sent on successful connection |
| `joined` | `roomName` | Confirmed room join |
| `left` | `roomName` | Confirmed room leave |
| `room_created` | `roomName` | Confirmed room creation |
| `room_deleted` | `roomName`, `timestamp` | Room was deleted |
| `history` | `messages[]` | Message history on join |
| `rooms_list` | `rooms[]` | List of rooms with occupancy |
| `online_list` | `users[]` | List of usernames in current room |
| `chat` | `username`, `text`, `timestamp` | Broadcast chat message |
| `system` | `text`, `timestamp` | Join/leave/info notification |
| `error` | `text` | Error message |

## Connection close codes

| Code | Reason |
|---|---|
| 4001 | Username is required |
| 4002 | Username already taken |
