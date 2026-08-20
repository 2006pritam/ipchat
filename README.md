# IPChat — Room-Based Group Messenger, Voice & Video Collage

A minimal, encrypted real-time chat, group voice calling, and multi-user video meet web application where you join a room simply by entering a **shared IP address** as the room code. Anyone who types the same IP lands in the same room. A recreation and enhancement of [ipchat.in](https://ipchat.in/).

---

## ✨ Features

- 👥 **Group Video Collage Meet (Multi-Friend Mesh WebRTC)**:
  - Dynamic responsive video collage / grid layout (1 participant = full view, 2 = split screen, 3-4 = 2x2 grid, 5+ = responsive collage).
  - Any friend in the room can start a voice or video call.
  - If a friend declines or doesn't want to join immediately, the call continues uninterrupted for others.
  - **Late Join / Re-join Banner**: A live indicator appears at the top of the chat allowing friends to join or rejoin the active meet at any time!
  - Individuals can leave the call without disconnecting others.
- 📞 **P2P Encrypted Group Voice Calls**:
  - Multi-user voice meets with live soundwave equalizer and glowing avatars.
  - Dedicated independent audio streaming channel ensuring crystal-clear audio.
- 📹 **Screen Sharing & Camera Controls**:
  - One-click screen sharing (`getDisplayMedia`) across all connected peers.
  - Camera and microphone toggle controls.
- 🎙️ **Voice Notes**:
  - Instant audio recording and encrypted transmission with real-time timer, sound wave animation, and custom playback.
- 🖼️ **Photo Upload & Sharing**:
  - Send photos with gallery/camera picker, drag & drop, or clipboard paste (`Ctrl+V`), with automatic compression and fullscreen viewer.
- 🔐 **End-to-End Encryption (E2E)**:
  - Messages, photos, and voice notes are AES-GCM encrypted in the browser with a 256-bit key derived (PBKDF2 with SHA-256) from the room's IP. The server only relays opaque ciphertext.
- 🔌 **Real-Time Messaging** over Socket.IO with auto-reconnection.
- 👥 **Live Members List** with direct call actions.
- ✍️ **Typing Indicators**
- ↩️ **Replies** — Double-click any message, photo, or voice note to reply.
- 🗑️ **Clear Chat** for everyone in the room.
- 📱 **Mobile Responsive Cyber Dark Theme**.

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

Then open `http://localhost:3000` in multiple browser tabs or devices, enter the **same IP** (e.g. `192.168.1.1`) with different usernames, and chat or meet together!

Set a custom port:
```bash
PORT=8080 npm start
```

## 🔒 How the "IP Room" & Encryption Work

The IP address is used purely as a **room code** and as the seed for client-side cryptographic key derivation:
1. When you enter an IP address, Web Crypto derives a 256-bit AES-GCM encryption key using PBKDF2 with 100,000 iterations and SHA-256.
2. Text messages, photos, and voice notes are encrypted in your browser before transmitting over WebSockets.
3. Group voice and video calls connect via mesh WebRTC media streams and STUN signaling.

## 📁 Project Structure

```
ipchat/
├── server.js          # Express + Socket.IO relay server & Group WebRTC signaling
├── public/
│   ├── index.html     # Join screen + Chat interface + Group Meet Collage modal
│   ├── style.css      # Cyber dark styling, Dynamic collage grid & responsive layout
│   └── script.js      # Client: Web Crypto E2E, MediaRecorder, Mesh WebRTC, AudioContext
├── package.json       # Dependencies and scripts
└── render.yaml        # Render deployment blueprint
```

## 👤 Author

© 2026 **Pritam Kumar Modak**
