# IPChat — Room-Based Messenger

A minimal real-time chat where you join a room simply by entering a **shared IP address** as the room code. Anyone who types the same IP lands in the same room. A recreation of [ipchat.in](https://ipchat.in/).

## Features

- 🔌 **Real-time messaging** over Socket.IO
- 🔐 **End-to-end encryption** — messages are AES-GCM encrypted in the browser with a key derived (PBKDF2) from the room's IP. The server only relays opaque ciphertext.
- 👥 **Live members list** and online count
- ✍️ **Typing indicators**
- ↩️ **Replies** — double-click any message to reply to it
- 🖼️ **Image sharing** (up to 2 MB), with full-screen preview
- 🗑️ **Clear chat** for everyone in the room
- 📱 Responsive, dark, terminal-styled UI

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:3000 in two browser tabs, enter the **same IP** (e.g. `192.168.1.1`) with different usernames, and chat.

Set a custom port with `PORT=8080 npm start`.

## How the "IP room" works

The IP address is used purely as a **room code** and as the seed for the encryption key — it is never used to look up your actual network address. Two people who agree on an IP string share a private, encrypted room.

## Project structure

```
server.js          Express + Socket.IO relay server
public/
  index.html       Join + chat screens
  style.css        Dark terminal theme
  script.js        Client: encryption, sockets, UI
```
# ipchat
