# ws-chat client

CLI chat client for the ws-chat server. Messages are end-to-end encrypted using AES-256-GCM — encryption and decryption happen entirely on the client using a key derived from the room password.

## Requirements

- Node.js 18+

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

## Usage

```bash
ws-chat                        # connects to localhost:8080 (ws://)
ws-chat example.com            # connects to a remote host (wss://)
ws-chat example.com:9000       # connects to a remote host on a non-default port (wss://)
ws-chat localhost:9000         # connects to a local server on a non-default port (ws://)
```

Pass only the hostname or `host:port` — no protocol prefix. Remote connections automatically use `wss://`; local connections use `ws://`.

On launch you will be prompted for a username, then connected to the server.

## Slash commands

| Command | Description |
|---|---|
| `/join <roomName>` | Join a room (prompts for room password) |
| `/leave` | Leave the current room |
| `/online` | List users currently in the room |
| `/create <roomName>` | Create a room — admin only (prompts for room password and admin password) |
| `/delete <roomName>` | Delete a room — admin only (prompts for admin password) |
| `/rooms` | List all active rooms — admin only (prompts for admin password) |
| `/logout` | Disconnect and exit |
| `/help` | Show available commands |

## Example session

```
ws-chat

 ██╗    ██╗███████╗     ██████╗██╗  ██╗ █████╗ ████████╗
 ██║    ██║██╔════╝    ██╔════╝██║  ██║██╔══██╗╚══██╔══╝
 ██║ █╗ ██║███████╗    ██║     ███████║███████║   ██║
 ██║███╗██║╚════██║    ██║     ██╔══██║██╔══██║   ██║
 ╚███╔███╔╝███████║    ╚██████╗██║  ██║██║  ██║   ██║
  ╚══╝╚══╝ ╚══════╝     ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
                    encrypted • secure • anonymous
```

Username: alice
Welcome, alice. Use /join <room> <password> to join a room.
Type /help for available commands.

> /join general
Room password:
*** Joined room "general" ***

--- Message History ---
[10:14:32 AM] bob: anyone around?
--- End of History ---

[general] > hey bob!
[10:21:05 AM] bob: hey alice!
[general] > /online

Online in "general" (2):
  • alice
  • bob

[general] > /leave
*** You have left "general" ***

> /logout
Logging out...
```

## End-to-end encryption

Each room has its own encryption key derived from its password using PBKDF2 (100,000 iterations, SHA-256). Messages are encrypted with AES-256-GCM before being sent, and decrypted on receipt. A random 12-byte IV is generated per message and included alongside the ciphertext. The server only ever sees ciphertext and cannot read message content.

## Admin commands

Admin commands require the admin password set on the server. The admin password is never stored or transmitted in plain text — it is hashed client-side before being sent.

To create a room:

```
> /create dev
Room password:
Confirm room password:
Admin password:
*** Room "dev" created successfully ***
```
