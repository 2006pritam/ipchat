# IPChat — Room-Based Messenger, Voice & Video Calls

A minimal, encrypted real-time chat, voice calling, and video calling web application where you join a room simply by entering a **shared IP address** as the room code. Anyone who types the same IP lands in the same room. A recreation and enhancement of [ipchat.in](https://ipchat.in/).

## ✨ Features

- 📞 **P2P Encrypted Voice Calls** — Real-time audio calling with live soundwaves, ringtone/dialtone audio, and mute controls.
- 📹 **P2P Encrypted Video Calls** — WebRTC video calling with screen sharing, camera toggle, and Picture-in-Picture (PiP).
- 🎙️ **Voice Notes** — Instant audio recording and encrypted transmission with real-time timer, sound wave animation, and custom playback.
- 🖼️ **Photo Upload & Sharing** — Send photos with gallery/camera picker, drag & drop, or clipboard paste (`Ctrl+V`), with automatic compression and fullscreen viewer.
- 🔐 **End-to-End Encryption (E2E)** — Messages, photos, and voice notes are AES-GCM encrypted in the browser with a 256-bit key derived (PBKDF2 with SHA-256) from the room's IP. The server only relays opaque ciphertext.
- 🔌 **Real-Time Messaging** over Socket.IO with auto-reconnection.
- 👥 **Live Members List** with direct 📞 Voice and 📹 Video call buttons for each member.
- ✍️ **Typing Indicators**
- ↩️ **Replies** — Double-click any message, photo, or voice note to reply.
- 🗑️ **Clear Chat** for everyone in the room.
- 📱 **Mobile Responsive Dark Cyber Terminal Theme**.

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

Then open `http://localhost:3000` in two browser tabs or on two devices, enter the **same IP** (e.g. `192.168.1.1`) with different usernames, and chat, voice call, or video call.

Set a custom port:
```bash
PORT=8080 npm start
```

## 🔒 How the "IP Room" & Encryption Work

The IP address is used purely as a **room code** and as the seed for client-side cryptographic key derivation:
1. When you enter an IP address, Web Crypto derives a 256-bit AES-GCM encryption key using PBKDF2 with 100,000 iterations and SHA-256.
2. Text messages, photos, and voice notes are encrypted in your browser before transmitting over WebSockets.
3. Voice and video calls connect peer-to-peer using WebSockets signaling and encrypted DTLS/SRTP WebRTC media channels.

## 📁 Project Structure

```
ipchat/
├── server.js          # Express + Socket.IO relay server & WebRTC signaling
├── public/
│   ├── index.html     # Join screen + Chat interface + Voice & Video call modals
│   ├── style.css      # Cyber dark styling, audio visualizers & responsive layout
│   └── script.js      # Client: Web Crypto E2E, MediaRecorder, WebRTC, AudioContext
├── package.json       # Dependencies and scripts
└── render.yaml        # Render deployment blueprint
```

## 👤 Author

© 2026 **Pritam Kumar Modak**
