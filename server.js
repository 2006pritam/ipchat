// ── IPChat server ──────────────────────────────────────────────
// Room-based real-time messenger. Users "join" a room by entering a
// shared IP address (used purely as a room code). Messages are E2E
// encrypted on the client — the server only relays opaque ciphertext.
// Includes WebRTC signaling for peer-to-peer encrypted Voice & Video Calls.

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 15 * 1024 * 1024, // allow encrypted image and voice note payloads (up to 15MB)
});

const PORT = process.env.PORT || 3000;

// ── Static files + wake/health endpoint ──
app.use(express.static(path.join(__dirname, "public")));
app.get("/ping", (_req, res) => res.status(200).send("pong"));

// ── In-memory room membership ──
// rooms: Map<roomName, Map<socketId, username>>
const rooms = new Map();

function getMembers(room) {
  const map = rooms.get(room);
  if (!map) return [];
  return [...map.entries()].map(([id, username]) => ({ id, username }));
}

function broadcastMembers(room) {
  io.to(room).emit("members_update", { members: getMembers(room) });
}

io.on("connection", (socket) => {
  console.log(`✅ connected: ${socket.id}`);

  socket.on("join_room", ({ username, room }) => {
    if (!username || !room) return;
    username = String(username).slice(0, 20);
    room = String(room).slice(0, 64);

    socket.data.username = username;
    socket.data.room = room;

    socket.join(room);
    if (!rooms.has(room)) rooms.set(room, new Map());
    rooms.get(room).set(socket.id, username);

    socket.to(room).emit("user_joined", { message: `${username} joined the room` });
    broadcastMembers(room);
    console.log(`➡️  ${username} joined ${room}`);
  });

  socket.on("send_message", ({ message, room, reply }) => {
    if (!message || !room) return;
    io.to(room).emit("receive_message", {
      username: socket.data.username || "anon",
      message,
      senderId: socket.id,
      reply: reply || null,
    });
  });

  socket.on("send_image", ({ imageData, room, reply }) => {
    if (!imageData || !room) return;
    io.to(room).emit("receive_image", {
      username: socket.data.username || "anon",
      imageData,
      senderId: socket.id,
      reply: reply || null,
    });
  });

  socket.on("send_voice", ({ audioData, duration, room, reply }) => {
    if (!audioData || !room) return;
    io.to(room).emit("receive_voice", {
      username: socket.data.username || "anon",
      audioData,
      duration: duration || 0,
      senderId: socket.id,
      reply: reply || null,
    });
  });

  socket.on("typing_start", ({ room }) => {
    if (!room) return;
    socket.to(room).emit("user_typing", { username: socket.data.username });
  });

  socket.on("typing_stop", ({ room }) => {
    if (!room) return;
    socket.to(room).emit("user_stopped_typing", { username: socket.data.username });
  });

  socket.on("clear_chat", ({ room }) => {
    if (!room) return;
    io.to(room).emit("chat_cleared", { clearedBy: socket.data.username || "someone" });
  });

  // ── WebRTC Call Signaling (Voice & Video) ──
  socket.on("call_user", ({ to, offer, callType }) => {
    if (!to || !offer) return;
    io.to(to).emit("incoming_call", {
      from: socket.id,
      username: socket.data.username || "anon",
      offer,
      callType: callType || "video",
    });
  });

  socket.on("answer_call", ({ to, answer }) => {
    if (!to || !answer) return;
    io.to(to).emit("call_answered", {
      from: socket.id,
      answer,
    });
  });

  socket.on("ice_candidate", ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit("ice_candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("reject_call", ({ to }) => {
    if (!to) return;
    io.to(to).emit("call_rejected", {
      from: socket.id,
      username: socket.data.username || "anon",
    });
  });

  socket.on("end_call", ({ to, room }) => {
    if (to) {
      io.to(to).emit("call_ended", { from: socket.id });
    } else if (room) {
      socket.to(room).emit("call_ended", { from: socket.id });
    }
  });

  socket.on("disconnect", () => {
    const { room, username } = socket.data;
    if (room && rooms.has(room)) {
      rooms.get(room).delete(socket.id);
      if (rooms.get(room).size === 0) rooms.delete(room);
      socket.to(room).emit("user_left", { message: `${username} left the room` });
      socket.to(room).emit("user_stopped_typing", { username });
      socket.to(room).emit("call_ended", { from: socket.id });
      broadcastMembers(room);
    }
    console.log(`⚠️  disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 IPChat running on http://localhost:${PORT}`);
});
