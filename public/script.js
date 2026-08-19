// ── Connect to Socket.IO server ──
const socket = io({
  transports: ["polling", "websocket"],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// ── State ──
let myUsername = "";
let myRoom = "";
let cryptoKey = null;
let replyingTo = null;

// Voice recording state
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingStartTime = 0;
let isRecording = false;
let audioStream = null;
let currentlyPlayingAudio = null;

// ── DOM references ──
const joinScreen          = document.getElementById("join-screen");
const chatScreen          = document.getElementById("chat-screen");
const usernameInput       = document.getElementById("username-input");
const ipInput             = document.getElementById("ip-input");
const joinBtn             = document.getElementById("join-btn");
const joinError           = document.getElementById("join-error");
const messagesArea        = document.getElementById("messages");
const messageInput        = document.getElementById("message-input");
const sendBtn             = document.getElementById("send-btn");
const leaveBtn            = document.getElementById("leave-btn");
const roomDisplay         = document.getElementById("room-display");
const headerIp            = document.getElementById("header-ip");
const headerUsername      = document.getElementById("header-username");
const userCount           = document.getElementById("user-count");
const clearBtn            = document.getElementById("clear-btn");
const imageBtn            = document.getElementById("image-btn");
const imageInput          = document.getElementById("image-input");
const voiceBtn            = document.getElementById("voice-btn");
const recordingBar        = document.getElementById("recording-bar");
const recordingTimer      = document.getElementById("recording-timer");
const cancelRecordingBtn  = document.getElementById("cancel-recording-btn");
const sendRecordingBtn    = document.getElementById("send-recording-btn");
const chatInputBar        = document.getElementById("chat-input-bar");
const menuToggle          = document.getElementById("menu-toggle");
const sidebar             = document.querySelector(".sidebar");
const replyPreview        = document.getElementById("reply-preview");
const replyText           = document.getElementById("reply-text");
const replyCancelBtn      = document.getElementById("reply-cancel");
const membersList         = document.getElementById("members-list");
const dragDropOverlay     = document.getElementById("drag-drop-overlay");
const imageViewerModal    = document.getElementById("image-viewer-modal");
const overlayImg          = document.getElementById("overlay-img");
const overlayCloseBtn     = document.getElementById("overlay-close-btn");
const overlayDownloadBtn  = document.getElementById("overlay-download-btn");

// ── Connection status ──
socket.on("connect", () => { console.log("✅ Connected:", socket.id); });
socket.on("connect_error", (err) => { console.error("❌ Error:", err.message); });
socket.on("disconnect", (reason) => { console.warn("⚠️ Disconnected:", reason); });

// ── Mobile keyboard fix ──
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const cs = document.getElementById("chat-screen");
    if (cs) cs.style.height = window.visualViewport.height + "px";
    scrollToBottom();
  });
}

// ── Wake up server ──
async function wakeServer() {
  const statusEl = document.getElementById("wake-status");
  try {
    statusEl.textContent = "Connecting to server...";
    await fetch("/ping");
    statusEl.textContent = "";
    joinBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = "Server is waking up, please wait...";
    setTimeout(wakeServer, 3000);
  }
}
joinBtn.disabled = true;
wakeServer();

// ── E2E ENCRYPTION ──
async function deriveKeyFromIP(ip) {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", encoder.encode(ip), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("ipchat-salt-v1"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptText(plainText) {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoder.encode(plainText));
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(base64) {
  try {
    const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch { return "🔒 Unable to decrypt message"; }
}

// ── Format audio seconds helper ──
function formatAudioTime(seconds) {
  const s = Math.floor(seconds || 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

// ── Validate IP ──
function isValidIP(value) {
  const trimmed = value.trim();
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed) || /^[0-9a-fA-F:]{3,}$/.test(trimmed);
}

// ── JOIN ──
async function joinRoom() {
  const username = usernameInput.value.trim();
  const ip = ipInput.value.trim();
  if (!username) { showError("Please enter a username."); usernameInput.focus(); return; }
  if (!ip) { showError("Please enter an IP address."); ipInput.focus(); return; }
  if (!isValidIP(ip)) { showError("That doesn't look like a valid IP address."); ipInput.focus(); return; }

  joinBtn.disabled = true;
  joinBtn.querySelector("span").textContent = "SECURING...";
  cryptoKey = await deriveKeyFromIP(ip);

  myUsername = username;
  myRoom = ip;
  socket.emit("join_room", { username: myUsername, room: myRoom });

  joinScreen.classList.remove("active");
  chatScreen.classList.add("active");
  roomDisplay.textContent = myRoom;
  headerIp.textContent = myRoom;
  headerUsername.textContent = myUsername;
  messageInput.focus();
}

function showError(msg) {
  joinError.textContent = msg;
  joinError.style.animation = "none";
  void joinError.offsetWidth;
  joinError.style.animation = "";
  joinBtn.disabled = false;
  joinBtn.querySelector("span").textContent = "CONNECT";
}

joinBtn.addEventListener("click", joinRoom);
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
ipInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });

// ── MEMBERS LIST ──
socket.on("members_update", ({ members }) => {
  userCount.textContent = members.length;
  membersList.innerHTML = "";
  members.forEach(({ id, username }) => {
    const isMe = id === socket.id;
    const item = document.createElement("div");
    item.className = `member-item${isMe ? " member-me" : ""}`;
    item.innerHTML = `
      <span class="member-dot"></span>
      <span class="member-name">${escapeHtml(username)}</span>
      ${isMe ? '<span class="member-you-tag">you</span>' : ""}
    `;
    membersList.appendChild(item);
  });
});

// ── REPLY SYSTEM ──
function setReply(username, message, isImage = false, isVoice = false) {
  replyingTo = { username, message, isImage, isVoice };
  if (isVoice) {
    replyText.textContent = `🎙 ${username}: [Voice Note]`;
  } else if (isImage) {
    replyText.textContent = `📷 ${username}: [Photo]`;
  } else {
    replyText.textContent = `${username}: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`;
  }
  replyPreview.classList.add("active");
  messageInput.focus();
  scrollToBottom();
}

function cancelReply() {
  replyingTo = null;
  replyPreview.classList.remove("active");
}

replyCancelBtn.addEventListener("click", cancelReply);

// ── SEND MESSAGE ──
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  stopTyping();
  const payload = {
    message: await encryptText(text),
    room: myRoom,
    reply: replyingTo ? {
      username: replyingTo.username,
      message: await encryptText(replyingTo.isVoice ? "[Voice Note]" : replyingTo.isImage ? "[Photo]" : replyingTo.message),
      isImage: replyingTo.isImage || false,
      isVoice: replyingTo.isVoice || false
    } : null
  };
  socket.emit("send_message", payload);
  messageInput.value = "";
  cancelReply();
  messageInput.focus();
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === "Escape") cancelReply();
});

// ── PHOTO UPLOAD & HANDLING ──
imageBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (file) handleImageUpload(file);
  imageInput.value = "";
});

async function handleImageUpload(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please select a valid image file.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("Image is too large! Please choose an image under 8MB.");
    return;
  }

  const indicator = document.createElement("div");
  indicator.className = "uploading-indicator";
  indicator.textContent = "Encrypting & uploading photo...";
  messagesArea.appendChild(indicator);
  scrollToBottom();

  try {
    const dataUrl = await readFileOrCompress(file);
    const encryptedData = await encryptText(dataUrl);

    const payload = {
      imageData: encryptedData,
      room: myRoom,
      reply: replyingTo ? {
        username: replyingTo.username,
        message: await encryptText(replyingTo.isVoice ? "[Voice Note]" : replyingTo.isImage ? "[Photo]" : replyingTo.message),
        isImage: replyingTo.isImage || false,
        isVoice: replyingTo.isVoice || false
      } : null
    };

    socket.emit("send_image", payload);
    cancelReply();
  } catch (err) {
    console.error("Image upload failed:", err);
    alert("Failed to process image.");
  } finally {
    indicator.remove();
  }
}

// Compress large images client-side before encrypting
function readFileOrCompress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(e.target.result);
      img.onload = () => {
        const MAX_DIM = 1600;
        let { width, height } = img;
        if (width <= MAX_DIM && height <= MAX_DIM && file.size < 1.5 * 1024 * 1024) {
          return resolve(e.target.result);
        }
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Drag and drop photo support
let dragCounter = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (chatScreen.classList.contains("active")) {
    dragCounter++;
    dragDropOverlay.classList.add("active");
  }
});

window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (chatScreen.classList.contains("active")) {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragDropOverlay.classList.remove("active");
    }
  }
});

window.addEventListener("dragover", (e) => { e.preventDefault(); });

window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  dragDropOverlay.classList.remove("active");
  if (!chatScreen.classList.contains("active")) return;
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith("image/")) {
      handleImageUpload(file);
    }
  }
});

// Clipboard Paste image support (Ctrl+V / Cmd+V)
window.addEventListener("paste", (e) => {
  if (!chatScreen.classList.contains("active")) return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        handleImageUpload(file);
        break;
      }
    }
  }
});

// ── VOICE NOTE RECORDING ──
voiceBtn.addEventListener("click", startVoiceRecording);
cancelRecordingBtn.addEventListener("click", () => stopVoiceRecording(false));
sendRecordingBtn.addEventListener("click", () => stopVoiceRecording(true));

async function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Microphone recording is not supported in this browser.");
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error("Microphone access error:", err);
    alert("Microphone permission was denied or is unavailable.");
    return;
  }

  const mimeType = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "audio/aac"
  ].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";

  try {
    mediaRecorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
  } catch (e) {
    mediaRecorder = new MediaRecorder(audioStream);
  }

  audioChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  isRecording = true;
  recordingStartTime = Date.now();
  recordingTimer.textContent = "0:00";

  // Switch UI to recording mode
  chatInputBar.style.display = "none";
  recordingBar.classList.add("active");

  recordingTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    recordingTimer.textContent = formatAudioTime(elapsed);
  }, 1000);

  mediaRecorder.start(250);
}

function stopVoiceRecording(shouldSend) {
  if (!isRecording || !mediaRecorder) return;
  clearInterval(recordingTimerInterval);
  isRecording = false;

  const durationSec = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));

  mediaRecorder.onstop = async () => {
    // Release microphone tracks
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }

    // Reset UI
    recordingBar.classList.remove("active");
    chatInputBar.style.display = "flex";

    if (!shouldSend) {
      audioChunks = [];
      return;
    }

    if (durationSec < 1 && audioChunks.length === 0) {
      return;
    }

    const recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    audioChunks = [];

    const indicator = document.createElement("div");
    indicator.className = "uploading-indicator";
    indicator.textContent = "Encrypting & sending voice note...";
    messagesArea.appendChild(indicator);
    scrollToBottom();

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const audioDataUrl = e.target.result;
        const encryptedAudio = await encryptText(audioDataUrl);

        const payload = {
          audioData: encryptedAudio,
          duration: durationSec,
          room: myRoom,
          reply: replyingTo ? {
            username: replyingTo.username,
            message: await encryptText(replyingTo.isVoice ? "[Voice Note]" : replyingTo.isImage ? "[Photo]" : replyingTo.message),
            isImage: replyingTo.isImage || false,
            isVoice: replyingTo.isVoice || false
          } : null
        };

        socket.emit("send_voice", payload);
        cancelReply();
        indicator.remove();
      };
      reader.readAsDataURL(recordedBlob);
    } catch (err) {
      console.error("Voice note processing error:", err);
      indicator.remove();
    }
  };

  try {
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  } catch (e) {
    console.error("Error stopping recorder:", e);
  }
}

// ── Timestamp helper ──
function getTimestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── TYPING INDICATOR ──
const typingIndicator = document.getElementById("typing-indicator");
let typingTimeout = null;
let isTyping = false;
const typingUsers = {};

messageInput.addEventListener("input", () => {
  if (!myRoom) return;
  if (!isTyping) { isTyping = true; socket.emit("typing_start", { room: myRoom }); }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { isTyping = false; socket.emit("typing_stop", { room: myRoom }); }, 1500);
});

function stopTyping() {
  if (isTyping) { isTyping = false; clearTimeout(typingTimeout); socket.emit("typing_stop", { room: myRoom }); }
}

socket.on("user_typing", ({ username }) => { typingUsers[username] = true; renderTypingIndicator(); });
socket.on("user_stopped_typing", ({ username }) => { delete typingUsers[username]; renderTypingIndicator(); });

function renderTypingIndicator() {
  const names = Object.keys(typingUsers);
  if (names.length === 0) { typingIndicator.innerHTML = ""; return; }
  const label = names.length === 1
    ? `<span class="typing-name">${escapeHtml(names[0])}</span> is typing`
    : names.length === 2
    ? `<span class="typing-name">${escapeHtml(names[0])}</span> and <span class="typing-name">${escapeHtml(names[1])}</span> are typing`
    : `<span class="typing-name">Several people</span> are typing`;
  typingIndicator.innerHTML = `${label}<div class="typing-dots"><span></span><span></span><span></span></div>`;
  scrollToBottom();
}

// ── CLEAR CHAT ──
clearBtn.addEventListener("click", () => {
  if (confirm("Clear the chat for everyone in this room?")) socket.emit("clear_chat", { room: myRoom });
});
socket.on("chat_cleared", ({ clearedBy }) => {
  messagesArea.innerHTML = `<div class="welcome-msg"><span>— Start of conversation —</span></div>`;
  appendSystemMessage(`${clearedBy} cleared the chat`);
  Object.keys(typingUsers).forEach(k => delete typingUsers[k]);
  renderTypingIndicator();
  cancelReply();
});

// ── LEAVE ROOM ──
leaveBtn.addEventListener("click", () => location.reload());

// ── MOBILE SIDEBAR ──
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
document.addEventListener("click", (e) => {
  if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== menuToggle)
    sidebar.classList.remove("open");
});

// ── SOCKET EVENTS ──
socket.on("receive_message", async ({ username, message, senderId, reply }) => {
  const decrypted = await decryptText(message);
  const decryptedReply = reply ? {
    username: reply.username,
    message: await decryptText(reply.message),
    isImage: reply.isImage,
    isVoice: reply.isVoice
  } : null;
  appendMessage({ username, message: decrypted, timestamp: getTimestamp(), isSelf: senderId === socket.id, reply: decryptedReply });
});

socket.on("receive_image", async ({ username, imageData, senderId, reply }) => {
  const decrypted = await decryptText(imageData);
  const decryptedReply = reply ? {
    username: reply.username,
    message: await decryptText(reply.message),
    isImage: reply.isImage,
    isVoice: reply.isVoice
  } : null;
  appendImage({ username, imageData: decrypted, timestamp: getTimestamp(), isSelf: senderId === socket.id, reply: decryptedReply });
});

socket.on("receive_voice", async ({ username, audioData, duration, senderId, reply }) => {
  const decrypted = await decryptText(audioData);
  const decryptedReply = reply ? {
    username: reply.username,
    message: await decryptText(reply.message),
    isImage: reply.isImage,
    isVoice: reply.isVoice
  } : null;
  appendVoiceNote({ username, audioData: decrypted, duration, timestamp: getTimestamp(), isSelf: senderId === socket.id, reply: decryptedReply });
});

socket.on("user_joined", ({ message }) => appendSystemMessage(message));
socket.on("user_left", ({ message }) => appendSystemMessage(message));

// ── HELPERS ──
function buildReplyBlock(reply) {
  if (!reply) return "";
  let icon = "↩";
  let content = escapeHtml(reply.message);
  if (reply.isVoice) {
    icon = "🎙";
    content = "Voice Note";
  } else if (reply.isImage) {
    icon = "📷";
    content = "Photo";
  }
  return `
    <div class="reply-block">
      <span class="reply-author">${icon} ${escapeHtml(reply.username)}</span>
      <span class="reply-content">${content}</span>
    </div>`;
}

function appendMessage({ username, message, timestamp, isSelf, reply }) {
  const div = document.createElement("div");
  div.className = `msg ${isSelf ? "self" : "other"}`;
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${escapeHtml(username)}</span>
      <span class="msg-time">${timestamp}</span>
    </div>
    <div class="msg-bubble">${buildReplyBlock(reply)}${escapeHtml(message)}</div>`;
  div.addEventListener("dblclick", () => setReply(username, message, false, false));
  messagesArea.appendChild(div);
  scrollToBottom();
}

function appendImage({ username, imageData, timestamp, isSelf, reply }) {
  const div = document.createElement("div");
  div.className = `msg ${isSelf ? "self" : "other"}`;
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${escapeHtml(username)}</span>
      <span class="msg-time">${timestamp}</span>
    </div>
    <div class="msg-bubble img-bubble">
      ${buildReplyBlock(reply)}
      <div class="msg-image-wrap">
        <img src="${imageData}" class="msg-image" alt="Encrypted photo" loading="lazy" />
        <div class="image-hover-hint">🔍 View Full</div>
      </div>
    </div>`;
  
  const imgEl = div.querySelector(".msg-image");
  imgEl.addEventListener("click", () => openImageViewer(imageData));
  div.addEventListener("dblclick", () => setReply(username, "", true, false));
  messagesArea.appendChild(div);
  scrollToBottom();
}

function appendVoiceNote({ username, audioData, duration, timestamp, isSelf, reply }) {
  const div = document.createElement("div");
  div.className = `msg ${isSelf ? "self" : "other"}`;

  const formattedDur = formatAudioTime(duration);
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${escapeHtml(username)}</span>
      <span class="msg-time">${timestamp}</span>
    </div>
    <div class="msg-bubble voice-bubble">
      ${buildReplyBlock(reply)}
      <div class="voice-player">
        <button class="voice-play-btn" aria-label="Play voice note">
          <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <svg class="pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
        </button>
        <div class="voice-track-container">
          <div class="voice-track">
            <div class="voice-progress"></div>
          </div>
          <div class="voice-info">
            <span class="voice-tag">🎙 Voice Note</span>
            <span class="voice-timer"><span class="voice-current-time">0:00</span> / ${formattedDur}</span>
          </div>
        </div>
        <audio src="${audioData}" preload="metadata"></audio>
      </div>
    </div>`;

  const player = div.querySelector(".voice-player");
  const playBtn = player.querySelector(".voice-play-btn");
  const playIcon = player.querySelector(".play-icon");
  const pauseIcon = player.querySelector(".pause-icon");
  const audio = player.querySelector("audio");
  const track = player.querySelector(".voice-track");
  const progress = player.querySelector(".voice-progress");
  const currentTimeEl = player.querySelector(".voice-current-time");

  function togglePlay() {
    if (audio.paused) {
      if (currentlyPlayingAudio && currentlyPlayingAudio !== audio) {
        currentlyPlayingAudio.pause();
      }
      audio.play();
      currentlyPlayingAudio = audio;
      playIcon.style.display = "none";
      pauseIcon.style.display = "block";
    } else {
      audio.pause();
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
    }
  }

  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay();
  });

  audio.addEventListener("timeupdate", () => {
    const cur = audio.currentTime;
    const dur = audio.duration || duration || 1;
    const pct = Math.min(100, (cur / dur) * 100);
    progress.style.width = pct + "%";
    currentTimeEl.textContent = formatAudioTime(cur);
  });

  audio.addEventListener("ended", () => {
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    progress.style.width = "0%";
    currentTimeEl.textContent = "0:00";
    if (currentlyPlayingAudio === audio) currentlyPlayingAudio = null;
  });

  audio.addEventListener("pause", () => {
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
  });

  // Seek on click
  track.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = track.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = audio.duration || duration || 0;
    if (dur > 0) {
      audio.currentTime = pos * dur;
      progress.style.width = (pos * 100) + "%";
    }
  });

  div.addEventListener("dblclick", () => setReply(username, "", false, true));
  messagesArea.appendChild(div);
  scrollToBottom();
}

// ── FULLSCREEN IMAGE VIEWER ──
function openImageViewer(src) {
  overlayImg.src = src;
  overlayDownloadBtn.href = src;
  imageViewerModal.style.display = "flex";
}

function closeImageViewer() {
  imageViewerModal.style.display = "none";
  overlayImg.src = "";
}

overlayCloseBtn.addEventListener("click", closeImageViewer);
imageViewerModal.addEventListener("click", (e) => {
  if (e.target === imageViewerModal) closeImageViewer();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && imageViewerModal.style.display === "flex") {
    closeImageViewer();
  }
});

function appendSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  messagesArea.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() { messagesArea.scrollTop = messagesArea.scrollHeight; }

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}