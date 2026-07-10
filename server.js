// ── IPChat server ──────────────────────────────────────────────
// Room-based real-time messenger. Users "join" a room by entering a
// shared IP address (used purely as a room code). Messages are E2E
// encrypted on the client — the server only relays opaque ciphertext.

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 5 * 1024 * 1024, // allow encrypted image payloads
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

  socket.on("disconnect", () => {
    const { room, username } = socket.data;
    if (room && rooms.has(room)) {
      rooms.get(room).delete(socket.id);
      if (rooms.get(room).size === 0) rooms.delete(room);
      socket.to(room).emit("user_left", { message: `${username} left the room` });
      socket.to(room).emit("user_stopped_typing", { username });
      broadcastMembers(room);
    }
    console.log(`⚠️  disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 IPChat running on http://localhost:${PORT}`);
});
