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
let currentMembers = [];

// Voice note recording state
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingStartTime = 0;
let isRecording = false;
let audioStream = null;
let currentlyPlayingAudio = null;

// ── Multi-Peer Mesh WebRTC State (Collage Meet) ──
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" }
  ],
  iceCandidatePoolSize: 10
};

const peerConnections = new Map(); // socketId -> RTCPeerConnection
const remoteAudios    = new Map(); // socketId -> HTMLAudioElement
const callPeers       = new Map(); // socketId -> username
const peerIceQueues   = new Map(); // socketId -> Array<RTCIceCandidateInit>
let localMediaStream  = null;
let screenStream      = null;
let currentCallType   = "voice"; // "voice" | "video"
let isInCall          = false;
let callTimerInterval = null;
let callStartTime     = 0;
let isMicMuted        = false;
let isCamOff          = false;
let isScreenSharing   = false;

// ── Web Audio Ringtone & Sound Synthesizer ──
let audioCtx = null;
let ringtoneInterval = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(e => console.warn("AudioContext resume:", e));
  }
  return audioCtx;
}

// Unlock audio context on user touch/click
document.addEventListener("click", () => {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(e => console.warn(e));
  }
}, { once: false });

function playIncomingRingtone() {
  stopRingtone();
  try {
    const ctx = getAudioContext();
    function beep() {
      if (!incomingCallModal || incomingCallModal.style.display === "none") {
        stopRingtone();
        return;
      }
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.setValueAtTime(480, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.5);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);
    }
    beep();
    ringtoneInterval = setInterval(beep, 2000);
  } catch (e) {
    console.warn("Incoming ringtone error:", e);
  }
}

function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

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

// Ongoing Call Banner
const ongoingCallBanner   = document.getElementById("ongoing-call-banner");
const callBannerInfo      = document.getElementById("call-banner-info");
const joinCallBannerBtn   = document.getElementById("join-call-banner-btn");

// Group Call DOM references
const voiceCallBtn        = document.getElementById("voice-call-btn");
const videoCallBtn        = document.getElementById("video-call-btn");
const incomingCallModal   = document.getElementById("incoming-call-modal");
const incomingCallIcon    = document.getElementById("incoming-call-icon");
const incomingCallTypeTitle = document.getElementById("incoming-call-type-title");
const incomingCallerName  = document.getElementById("incoming-caller-name");
const acceptCallBtn       = document.getElementById("accept-call-btn");
const rejectCallBtn       = document.getElementById("reject-call-btn");
const videoCallModal      = document.getElementById("video-call-modal");
const audioContainer      = document.getElementById("audio-container");
const collageGrid         = document.getElementById("collage-grid");
const localVideo          = document.getElementById("local-video");
const localVoiceAvatar    = document.getElementById("local-voice-avatar");
const callTypeBadge       = document.getElementById("call-type-badge");
const callPeerNameEl      = document.getElementById("call-peer-name");
const callDurationEl      = document.getElementById("call-duration");
const callStatusBadge     = document.getElementById("call-status-badge");
const callParticipantCount = document.getElementById("call-participant-count");
const toggleMicBtn        = document.getElementById("toggle-mic-btn");
const toggleCamBtn        = document.getElementById("toggle-cam-btn");
const toggleScreenBtn     = document.getElementById("toggle-screen-btn");
const endCallBtn          = document.getElementById("end-call-btn");

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

// ── Fast Chunked Uint8Array <-> Base64 conversion ──
function uint8ToBase64(uint8) {
  let binary = "";
  const len = uint8.byteLength;
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, Math.min(i + CHUNK_SIZE, len)));
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
  if (!cryptoKey) throw new Error("Encryption key is not initialized");
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoder.encode(plainText));
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return uint8ToBase64(combined);
}

async function decryptText(base64) {
  if (!cryptoKey) return "🔒 Key not available";
  try {
    const combined = base64ToUint8(base64);
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return "🔒 Unable to decrypt message";
  }
}

// ── Helper: Blob to Data URL ──
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Format audio/call seconds helper ──
function formatAudioTime(seconds) {
  const s = Math.floor(seconds || 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function formatCallTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

// ── Validate IP ──
function isValidIP(value) {
  const trimmed = value.trim();
  return /^(\\d{1,3}\\.){3}\\d{1,3}$/.test(trimmed) || /^[0-9a-fA-F:]{3,}$/.test(trimmed);
}

// ── JOIN ROOM ──
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
  currentMembers = members || [];
  userCount.textContent = currentMembers.length;
  membersList.innerHTML = "";
  currentMembers.forEach(({ id, username }) => {
    const isMe = id === socket.id;
    const item = document.createElement("div");
    item.className = `member-item${isMe ? " member-me" : ""}`;
    item.innerHTML = `
      <span class="member-dot"></span>
      <span class="member-name">${escapeHtml(username)}</span>
      ${isMe ? '<span class="member-you-tag">you</span>' : `
        <div class="member-action-btns">
          <button class="member-call-btn voice" title="Voice Meet in Room">📞</button>
          <button class="member-call-btn video" title="Video Meet in Room">📹</button>
        </div>
      `}
    `;
    if (!isMe) {
      const vCallBtn = item.querySelector(".member-call-btn.voice");
      const vidCallBtn = item.querySelector(".member-call-btn.video");
      if (vCallBtn) vCallBtn.addEventListener("click", () => initiateGroupCall("voice"));
      if (vidCallBtn) vidCallBtn.addEventListener("click", () => initiateGroupCall("video"));
    }
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
  if (file.size > 20 * 1024 * 1024) {
    alert("Image is too large! Please choose an image under 20MB.");
    return;
  }

  const indicator = document.createElement("div");
  indicator.className = "uploading-indicator";
  indicator.textContent = "Encrypting & sending photo...";
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
    console.error("Image upload error:", err);
    alert("Failed to process image: " + err.message);
  } finally {
    indicator.remove();
  }
}

function readFileOrCompress(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "image/svg+xml" || (file.type === "image/gif" && file.size < 1024 * 1024)) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1280;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = url;
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

  chatInputBar.style.display = "none";
  recordingBar.classList.add("active");

  recordingTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    recordingTimer.textContent = formatAudioTime(elapsed);
  }, 1000);

  mediaRecorder.start(200);
}

function stopVoiceRecording(shouldSend) {
  if (!isRecording || !mediaRecorder) return;
  clearInterval(recordingTimerInterval);
  isRecording = false;

  const durationSec = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));

  mediaRecorder.onstop = async () => {
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }

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
      const audioDataUrl = await blobToDataURL(recordedBlob);
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
    } catch (err) {
      console.error("Voice note error:", err);
      alert("Failed to encrypt and send voice note: " + err.message);
    } finally {
      indicator.remove();
    }
  };

  try {
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  } catch (e) {
    console.error("Error stopping recorder:", e);
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }
    recordingBar.classList.remove("active");
    chatInputBar.style.display = "flex";
  }
}

// ── MULTI-USER GROUP MEET & COLLAGE SYSTEM ──
voiceCallBtn.addEventListener("click", () => initiateGroupCall("voice"));
videoCallBtn.addEventListener("click", () => initiateGroupCall("video"));
joinCallBannerBtn.addEventListener("click", () => joinActiveGroupCall(currentCallType || "voice"));

async function initiateGroupCall(type = "voice") {
  if (isInCall) {
    alert("You are already in an active meet.");
    return;
  }
  await setupAndEnterCallScreen(type);
  // Inform server to register the meet and ring all other friends in the room
  socket.emit("start_group_call", { room: myRoom, callType: type });
}

async function joinActiveGroupCall(type = "voice") {
  if (isInCall) {
    alert("You are already in an active meet.");
    return;
  }
  await setupAndEnterCallScreen(type);
  // Inform server we are joining the running meet
  socket.emit("join_group_call", { room: myRoom });
}

async function setupAndEnterCallScreen(type = "voice") {
  currentCallType = type;
  isInCall = true;
  stopRingtone();
  incomingCallModal.style.display = "none";
  ongoingCallBanner.style.display = "none";

  callTypeBadge.textContent = type === "video" ? "VIDEO MEET" : "VOICE MEET";
  callStatusBadge.textContent = "Connected";
  callDurationEl.textContent = "00:00";
  videoCallModal.style.display = "flex";

  updateMeetControls(type);

  try {
    if (type === "video") {
      localMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localVideo.srcObject = localMediaStream;
      localVideo.muted = true;
      localVideo.style.display = "block";
      localVoiceAvatar.style.display = "none";
      localVideo.play().catch(e => console.warn(e));
      isCamOff = false;
    } else {
      localMediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localVideo.srcObject = null;
      localVideo.style.display = "none";
      localVoiceAvatar.style.display = "flex";
      isCamOff = true;
    }
  } catch (err) {
    console.warn("Could not get requested stream, falling back to audio:", err);
    try {
      localMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localVideo.srcObject = null;
      localVideo.style.display = "none";
      localVoiceAvatar.style.display = "flex";
      isCamOff = true;
      currentCallType = "voice";
      updateMeetControls("voice");
    } catch (e2) {
      alert("Could not access microphone. Please allow permissions in browser.");
      leaveGroupCall();
      return;
    }
  }

  startCallTimer();
  updateCollageLayout();
}

function updateMeetControls(type) {
  if (type === "voice") {
    callTypeBadge.textContent = "VOICE MEET";
    toggleCamBtn.style.display = "none";
    toggleScreenBtn.style.display = "none";
  } else {
    callTypeBadge.textContent = "VIDEO MEET";
    toggleCamBtn.style.display = "flex";
    toggleScreenBtn.style.display = "flex";
    toggleCamBtn.classList.remove("off");
    toggleCamBtn.querySelector(".icon-cam-on").style.display = "block";
    toggleCamBtn.querySelector(".icon-cam-off").style.display = "none";
  }
}

// ── WebRTC Peer Mesh Management ──
function getOrCreatePeerConnection(peerId, peerUsername, isInitiator = false) {
  if (peerConnections.has(peerId)) {
    return peerConnections.get(peerId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections.set(peerId, pc);
  callPeers.set(peerId, peerUsername);

  // Add local tracks to this peer connection
  if (localMediaStream) {
    localMediaStream.getTracks().forEach(track => {
      pc.addTrack(track, localMediaStream);
    });
  }

  // Create dedicated audio element for this peer
  let audioEl = remoteAudios.get(peerId);
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsinline = true;
    audioContainer.appendChild(audioEl);
    remoteAudios.set(peerId, audioEl);
  }

  // Ensure peer tile exists in the collage grid
  ensurePeerTile(peerId, peerUsername);

  pc.ontrack = (event) => {
    console.log(`📡 Remote track from ${peerUsername}:`, event.track.kind);

    if (event.track.kind === "audio") {
      let audioStream = audioEl.srcObject;
      if (!audioStream || !(audioStream instanceof MediaStream)) {
        audioStream = new MediaStream();
        audioEl.srcObject = audioStream;
      }
      if (!audioStream.getTracks().find(t => t.id === event.track.id)) {
        audioStream.addTrack(event.track);
      }
      audioEl.muted = false;
      audioEl.play().catch(e => console.warn("Remote audio play error:", e));
    }

    if (event.track.kind === "video") {
      const videoEl = document.getElementById("video-" + peerId);
      const avatarEl = document.getElementById("avatar-" + peerId);
      if (videoEl) {
        let videoStream = videoEl.srcObject;
        if (!videoStream || !(videoStream instanceof MediaStream)) {
          videoStream = new MediaStream();
          videoEl.srcObject = videoStream;
        }
        if (!videoStream.getTracks().find(t => t.id === event.track.id)) {
          videoStream.addTrack(event.track);
        }
        videoEl.style.display = "block";
        if (avatarEl) avatarEl.style.display = "none";
        videoEl.muted = false;
        videoEl.play().catch(e => console.warn("Remote video play error:", e));
      }
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal_ice_candidate", { to: peerId, candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log(`Connection state with ${peerUsername} (${peerId}):`, state);
    if (state === "disconnected" || state === "failed" || state === "closed") {
      removePeerTile(peerId);
    }
    updateParticipantCount();
  };

  updateCollageLayout();
  return pc;
}

async function drainIceCandidates(peerId, pc) {
  if (peerIceQueues.has(peerId)) {
    const queue = peerIceQueues.get(peerId);
    while (queue.length > 0) {
      const cand = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn(`Failed to add queued ICE candidate for ${peerId}:`, e);
      }
    }
  }
}

function ensurePeerTile(peerId, peerUsername) {
  if (document.getElementById("tile-" + peerId)) return;

  const tile = document.createElement("div");
  tile.className = "video-tile";
  tile.id = "tile-" + peerId;
  tile.innerHTML = `
    <video id="video-${peerId}" autoplay playsinline style="${currentCallType === 'voice' ? 'display:none;' : 'display:block;'}"></video>
    <div class="tile-meta">
      <span class="tile-name">${escapeHtml(peerUsername)}</span>
    </div>
    <div class="tile-voice-avatar" id="avatar-${peerId}" style="${currentCallType === 'voice' ? 'display:flex;' : 'display:none;'}">
      <div class="tile-avatar-circle">👤</div>
      <span class="tile-avatar-name">${escapeHtml(peerUsername)}</span>
    </div>
  `;
  collageGrid.appendChild(tile);
  updateCollageLayout();
  updateParticipantCount();
}

function removePeerTile(peerId) {
  const tile = document.getElementById("tile-" + peerId);
  if (tile) tile.remove();

  const audioEl = remoteAudios.get(peerId);
  if (audioEl) {
    audioEl.remove();
    remoteAudios.delete(peerId);
  }

  if (peerConnections.has(peerId)) {
    const pc = peerConnections.get(peerId);
    pc.close();
    peerConnections.delete(peerId);
  }

  peerIceQueues.delete(peerId);
  callPeers.delete(peerId);
  updateCollageLayout();
  updateParticipantCount();
}

function updateCollageLayout() {
  const tiles = collageGrid.querySelectorAll(".video-tile");
  const count = tiles.length;

  collageGrid.className = "collage-grid";
  if (count <= 1) collageGrid.classList.add("grid-1");
  else if (count === 2) collageGrid.classList.add("grid-2");
  else if (count <= 4) collageGrid.classList.add("grid-4");
  else if (count <= 6) collageGrid.classList.add("grid-6");
  else collageGrid.classList.add("grid-many");
}

function updateParticipantCount() {
  const total = peerConnections.size + 1;
  callParticipantCount.textContent = `👥 ${total} in meet`;
}

function startCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callStartTime = Date.now();
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    callDurationEl.textContent = formatCallTimer(elapsed);
  }, 1000);
}

// ── Multi-User Socket Signaling Handlers ──
socket.on("group_call_joined", async ({ callType, existingPeers }) => {
  console.log("Joined meet with existing peers:", existingPeers);
  currentCallType = callType;
  updateMeetControls(callType);

  // Connect to each existing peer as offer initiator
  for (const peer of existingPeers) {
    const pc = getOrCreatePeerConnection(peer.id, peer.username, true);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: currentCallType === "video"
      });
      await pc.setLocalDescription(offer);
      socket.emit("signal_offer", { to: peer.id, offer, callType: currentCallType });
    } catch (err) {
      console.error(`Error creating offer for ${peer.username}:`, err);
    }
  }
});

socket.on("peer_joined_group_call", ({ socketId, username, callType }) => {
  console.log(`Peer joined meet: ${username} (${socketId})`);
  if (!isInCall) return;
  getOrCreatePeerConnection(socketId, username, false);
});

socket.on("signal_offer", async ({ from, username, offer, callType }) => {
  if (!isInCall) {
    // If receiving offer, ensure local call screen & media is ready
    await setupAndEnterCallScreen(callType || "voice");
  }
  const pc = getOrCreatePeerConnection(from, username, false);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await drainIceCandidates(from, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal_answer", { to: from, answer });
  } catch (err) {
    console.error(`Error answering offer from ${username}:`, err);
  }
});

socket.on("signal_answer", async ({ from, answer }) => {
  if (peerConnections.has(from)) {
    const pc = peerConnections.get(from);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await drainIceCandidates(from, pc);
    } catch (err) {
      console.error("Error setting remote answer:", err);
    }
  }
});

socket.on("signal_ice_candidate", async ({ from, candidate }) => {
  if (!candidate) return;
  const pc = peerConnections.get(from);
  if (pc && pc.remoteDescription && pc.remoteDescription.type) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("Error adding ICE candidate:", err);
    }
  } else {
    if (!peerIceQueues.has(from)) {
      peerIceQueues.set(from, []);
    }
    peerIceQueues.get(from).push(candidate);
  }
});

socket.on("peer_left_group_call", ({ socketId, username }) => {
  console.log(`Peer left call: ${username} (${socketId})`);
  removePeerTile(socketId);
  appendSystemMessage(`${username} left the meet`);
});

// Incoming Call Notification for EVERY room member
socket.on("incoming_room_call", ({ startedBy, callType }) => {
  if (isInCall) return;

  currentCallType = callType || "voice";
  incomingCallerName.textContent = startedBy;
  incomingCallTypeTitle.textContent = callType === "video" ? "INCOMING VIDEO MEET" : "INCOMING VOICE MEET";
  incomingCallIcon.textContent = callType === "video" ? "📹" : "📞";
  incomingCallModal.style.display = "flex";
  playIncomingRingtone();
});

acceptCallBtn.addEventListener("click", () => {
  stopRingtone();
  joinActiveGroupCall(currentCallType || "voice");
});

rejectCallBtn.addEventListener("click", () => {
  stopRingtone();
  incomingCallModal.style.display = "none";
});

// Room Call State Update (Live Banner for all room members)
socket.on("room_call_state", ({ active, callType, startedBy, count, participants }) => {
  if (active && !isInCall) {
    currentCallType = callType;
    const typeLabel = callType === "video" ? "Video Meet" : "Voice Meet";
    callBannerInfo.textContent = `🟢 ${typeLabel} in progress (${count} friend${count > 1 ? "s" : ""})`;
    ongoingCallBanner.style.display = "flex";
  } else {
    ongoingCallBanner.style.display = "none";
  }
});

// In-Call Toolbar Controls
toggleMicBtn.addEventListener("click", () => {
  if (!localMediaStream) return;
  isMicMuted = !isMicMuted;
  localMediaStream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
  toggleMicBtn.classList.toggle("off", isMicMuted);
  toggleMicBtn.querySelector(".icon-mic-on").style.display = isMicMuted ? "none" : "block";
  toggleMicBtn.querySelector(".icon-mic-off").style.display = isMicMuted ? "block" : "none";
});

toggleCamBtn.addEventListener("click", async () => {
  if (!isInCall) return;

  if (isCamOff || currentCallType === "voice") {
    try {
      let videoTrack = localMediaStream ? localMediaStream.getVideoTracks()[0] : null;
      if (!videoTrack) {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoTrack = camStream.getVideoTracks()[0];
        if (localMediaStream) {
          localMediaStream.addTrack(videoTrack);
        }
        for (const [peerId, pc] of peerConnections) {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === "video") || senders.find(s => s.track === null);
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, localMediaStream);
          }
        }
      } else {
        videoTrack.enabled = true;
      }
      isCamOff = false;
      localVideo.srcObject = localMediaStream;
      localVideo.style.display = "block";
      localVoiceAvatar.style.display = "none";
      localVideo.play().catch(e => console.warn(e));
      currentCallType = "video";
      updateMeetControls("video");
    } catch (e) {
      console.error("Error activating camera:", e);
      alert("Could not activate camera.");
    }
  } else {
    if (localMediaStream) {
      localMediaStream.getVideoTracks().forEach(track => { track.enabled = false; });
    }
    isCamOff = true;
    localVideo.style.display = "none";
    localVoiceAvatar.style.display = "flex";
    toggleCamBtn.classList.add("off");
    toggleCamBtn.querySelector(".icon-cam-on").style.display = "none";
    toggleCamBtn.querySelector(".icon-cam-off").style.display = "block";
  }
});

toggleScreenBtn.addEventListener("click", async () => {
  if (!isInCall) return;
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      for (const [peerId, pc] of peerConnections) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === "video") || senders.find(s => s.track === null);
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, screenStream);
        }
      }
      localVideo.srcObject = screenStream;
      localVideo.style.display = "block";
      localVoiceAvatar.style.display = "none";
      localVideo.play().catch(e => console.warn(e));
      isScreenSharing = true;
      toggleScreenBtn.classList.add("active");

      screenTrack.onended = () => stopScreenShare();
    } catch (e) {
      console.error("Screen share error:", e);
    }
  } else {
    stopScreenShare();
  }
});

async function stopScreenShare() {
  if (!isScreenSharing) return;
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  if (localMediaStream) {
    const videoTrack = localMediaStream.getVideoTracks()[0];
    for (const [peerId, pc] of peerConnections) {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === "video") || senders.find(s => s.track === null);
      if (videoSender && videoTrack) {
        await videoSender.replaceTrack(videoTrack);
      }
    }
    if (videoTrack && videoTrack.enabled) {
      localVideo.srcObject = localMediaStream;
      localVideo.style.display = "block";
      localVoiceAvatar.style.display = "none";
      localVideo.play().catch(e => console.warn(e));
    } else {
      localVideo.style.display = "none";
      localVoiceAvatar.style.display = "flex";
    }
  }
  isScreenSharing = false;
  toggleScreenBtn.classList.remove("active");
}

endCallBtn.addEventListener("click", () => {
  leaveGroupCall();
});

function leaveGroupCall() {
  stopRingtone();
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  if (localMediaStream) { localMediaStream.getTracks().forEach(t => t.stop()); localMediaStream = null; }

  for (const [peerId, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();
  callPeers.clear();
  peerIceQueues.clear();

  // Clear audio elements and remote tiles
  audioContainer.innerHTML = "";
  remoteAudios.clear();

  const remoteTiles = collageGrid.querySelectorAll(".video-tile:not(.local-tile)");
  remoteTiles.forEach(t => t.remove());

  localVideo.srcObject = null;
  isInCall = false;
  isMicMuted = false;
  isCamOff = false;
  isScreenSharing = false;

  toggleMicBtn.classList.remove("off");
  toggleMicBtn.querySelector(".icon-mic-on").style.display = "block";
  toggleMicBtn.querySelector(".icon-mic-off").style.display = "none";

  toggleCamBtn.classList.remove("off");
  toggleCamBtn.querySelector(".icon-cam-on").style.display = "block";
  toggleCamBtn.querySelector(".icon-cam-off").style.display = "none";
  toggleScreenBtn.classList.remove("active");

  incomingCallModal.style.display = "none";
  videoCallModal.style.display = "none";

  socket.emit("leave_group_call", { room: myRoom });
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
      audio.play().catch(err => console.error("Audio playback error:", err));
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
