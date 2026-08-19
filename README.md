# IPChat — Room-Based Messenger & Video Calls

A minimal, encrypted real-time chat and video calling app where you join a room simply by entering a **shared IP address** as the room code. Anyone who types the same IP lands in the same room. A recreation and enhancement of [ipchat.in](https://ipchat.in/).

## ✨ Features

- 📹 **P2P Encrypted Video Calls** — High-quality WebRTC audio and video calling with screen sharing, mic/camera controls, and live call timer.
- 🎙️ **Voice Notes** — Instant recording and encrypted transmission with real-time timer, sound wave animation, and custom interactive playback.
- 🖼️ **Photo Upload & Sharing** — Send photos with gallery/camera picker, drag & drop, or clipboard paste (`Ctrl+V`), with automatic client-side compression and a fullscreen lightbox viewer.
- 🔐 **End-to-End Encryption (E2E)** — Messages, photos, and voice notes are AES-GCM encrypted in the browser with a 256-bit key derived (PBKDF2 with SHA-256) from the room's IP. The server only relays opaque ciphertext.
- 🔌 **Real-time messaging** over Socket.IO with auto-reconnection
- 👥 **Live members list** with direct member-calling support and real-time online counter
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

Then open `http://localhost:3000` in two browser tabs or on two devices, enter the **same IP** (e.g. `192.168.1.1`) with different usernames, and chat or video call.

Set a custom port:
```bash
PORT=8080 npm start
```

## 🔒 How the "IP Room" & Encryption Work

The IP address is used purely as a **room code** and as the seed for client-side cryptographic key derivation:
1. When you enter an IP address, Web Crypto derives a 256-bit AES-GCM encryption key using PBKDF2 with 100,000 iterations and SHA-256.
2. Text messages, photos, and voice notes are encrypted in your browser before transmitting over WebSockets.
3. Video and audio calls use peer-to-peer WebSockets signaling and encrypted DTLS/SRTP WebRTC media streams.

## 📁 Project Structure

```
ipchat/
├── server.js          # Express + Socket.IO relay server & WebRTC signaling
├── public/
│   ├── index.html     # Join screen + Chat interface + Video call modal
│   ├── style.css      # Cyber dark terminal styling, video layout & animations
│   └── script.js      # Client: Web Crypto E2E, MediaRecorder, WebRTC, UI
├── package.json       # Dependencies and scripts
└── render.yaml        # Render deployment blueprint
```

## 👤 Author

© 2026 **Pritam Kumar Modak**
