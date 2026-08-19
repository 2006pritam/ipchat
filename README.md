# IPChat — Room-Based Messenger

A minimal, real-time encrypted chat where you join a room simply by entering a **shared IP address** as the room code. Anyone who types the same IP lands in the same room. A recreation and enhancement of [ipchat.in](https://ipchat.in/).

## ✨ Features

- 🔌 **Real-time messaging** over Socket.IO with auto-reconnection
- 🔐 **End-to-End Encryption (E2E)** — All messages, photos, and voice notes are AES-GCM encrypted in the browser with a 256-bit key derived (PBKDF2 with SHA-256) from the room's IP. The server only relays opaque ciphertext.
- 🎙️ **Voice Notes** — Record and send encrypted voice notes with real-time timer, sound wave animation, and sleek interactive playback.
- 🖼️ **Photo Upload & Sharing** — Send photos with gallery/file picker, drag & drop, or clipboard paste (`Ctrl+V`), with automatic client-side compression and a fullscreen lightbox viewer.
- 👥 **Live members list** and real-time online counter
- ✍️ **Typing indicators**
- ↩️ **Replies** — Double-click any text message, photo, or voice note to reply
- 🗑️ **Clear chat** for everyone in the room
- 📱 **Responsive dark terminal UI** optimized for mobile and desktop

## 🚀 Run Locally

```bash
# Clone the repository
git clone https://github.com/2006pritam/ipchat.git
cd ipchat

# Install dependencies
npm install

# Start the server
npm start
```

Then open `http://localhost:3000` in two browser tabs, enter the **same IP** (e.g. `192.168.1.1`) with different usernames, and chat.

Set a custom port:
```bash
PORT=8080 npm start
```

## 🔒 How the "IP Room" & Encryption Work

The IP address is used purely as a **room code** and as the seed for client-side cryptographic key derivation:
1. When you enter an IP address, Web Crypto derives a 256-bit AES-GCM encryption key using PBKDF2 with 100,000 iterations and SHA-256.
2. Messages, photos, and voice audio blobs are encrypted in your browser before transmitting over WebSockets.
3. The server never sees plaintext messages, audio, or images — it only routes opaque ciphertext payloads.

## 📁 Project Structure

```
ipchat/
├── server.js          # Express + Socket.IO relay server
├── public/
│   ├── index.html     # Join screen + Chat interface + Modals
│   ├── style.css      # Cyber dark terminal styling & animations
│   └── script.js      # Client: Web Crypto E2E, MediaRecorder, Sockets, UI
├── package.json       # Dependencies and scripts
└── render.yaml        # Render deployment blueprint
```

## 👤 Author

© 2026 **Pritam Kumar Modak**
