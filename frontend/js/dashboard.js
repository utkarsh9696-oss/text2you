// ============================
// CONFIG
// ============================
const API_URL = "https://textify-zluc.onrender.com";
// const API_URL = "http://localhost:5000";

// ============================
// INIT
// ============================
const token = localStorage.getItem("token");
const user  = JSON.parse(localStorage.getItem("user"));
if (!token || !user || !user.username) { localStorage.clear(); window.location.href = "index.html"; }

document.getElementById("currentUsername").innerText = user.username;

const socket = io(API_URL);
socket.emit("setup", user);

let unreadCounts = {};
let onlineUsers  = [];
let currentChat  = null;
let typingTimeout = null;
let allChats     = [];

// ============================
// HELPERS
// ============================
function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function avatarPlaceholder(username) {
  const letter = (username || "?")[0].toUpperCase();
  const colors = [["#00c8b4","#006e64"],["#7c5cfc","#4a2fd4"],["#ff6b9d","#c93d6b"],["#f7931e","#b56000"],["#00b4d8","#006e8a"]];
  const [bg, fg] = colors[username.charCodeAt(0) % colors.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' rx='20' fill='${bg}'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='17' font-family='Segoe UI,sans-serif' font-weight='700'>${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function previewTime(date) {
  const d = new Date(date);
  const diff = Math.floor((new Date() - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ============================
// TOAST
// ============================
function showToast(message, emoji = "💬") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.classList.add("toast");
  toast.innerHTML = `${emoji} ${escapeHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================
// NOTIFICATION SOUND
// ============================
function playNotif() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 820; osc.type = "sine";
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// ============================
// MOBILE SIDEBAR
// ============================
const sidebar  = document.getElementById("sidebar");
const overlay  = document.getElementById("sidebarOverlay");
const chatWindow = document.getElementById("chatWindow");

function openSidebar()  { sidebar.classList.add("open"); overlay.classList.add("active"); }
function closeSidebar() { sidebar.classList.remove("open"); overlay.classList.remove("active"); }

overlay.addEventListener("click", closeSidebar);
document.getElementById("backBtn").addEventListener("click", () => {
  currentChat = null;
  chatWindow.classList.add("no-chat");
  openSidebar();
});

// ============================
// ONLINE STATUS
// ============================
socket.on("onlineUsers", (users) => { onlineUsers = users; refreshOnlineUI(); });
socket.on("userOnline",  (id)    => { if (!onlineUsers.includes(id)) onlineUsers.push(id); refreshOnlineUI(); });
socket.on("userOffline", (id)    => { onlineUsers = onlineUsers.filter(u => u !== id); refreshOnlineUI(); });

function refreshOnlineUI() {
  document.querySelectorAll(".status-dot[data-uid]").forEach(dot => {
    const on = onlineUsers.includes(dot.dataset.uid);
    dot.classList.toggle("online-dot",  on);
    dot.classList.toggle("offline-dot", !on);
  });
  if (currentChat) {
    const other = currentChat.participants.find(p => p._id !== user._id);
    const isOn  = onlineUsers.includes(other._id);
    const el    = document.getElementById("chatStatus");
    el.textContent  = isOn ? "Online" : "Offline";
    el.className    = isOn ? "online" : "";
  }
}

// ============================
// SIDEBAR TABS
// ============================
function showTab(tab) {
  document.getElementById("tabChats").classList.toggle("active", tab === "chats");
  document.getElementById("tabAll").classList.toggle("active", tab === "all");
  document.getElementById("chatList").classList.toggle("hidden", tab !== "chats");
  document.getElementById("allUsersList").classList.toggle("hidden", tab !== "all");
  if (tab === "all") loadAllUsers();
}

// ============================
// LOAD CHATS
// ============================
async function loadChats() {
  try {
    const res = await fetch(`${API_URL}/api/chats`, { headers: { Authorization: "Bearer " + token } });
    allChats  = await res.json();
    renderChatList(allChats);
  } catch(e) { console.error(e); }
}

function renderChatList(chats) {
  const chatList = document.getElementById("chatList");
  chatList.innerHTML = "";
  if (!chats.length) {
    chatList.innerHTML = `<div style="padding:24px;text-align:center;color:#6666aa;font-size:13px;">No chats yet.<br>Search to start one.</div>`;
    return;
  }
  chats.forEach(chat => {
    const other   = chat.participants.find(p => p._id !== user._id);
    const isOn    = onlineUsers.includes(other._id);
    const count   = unreadCounts[chat._id] || 0;
    const lastMsg = chat.latestMessage;

    const div = document.createElement("div");
    div.className = "chat-item" + (currentChat?._id === chat._id ? " active-chat" : "");
    div.setAttribute("data-chat-id", chat._id);
    div.innerHTML = `
      <div class="chat-left">
        <div class="av-wrap">
          <img src="${other.avatar || avatarPlaceholder(other.username)}" class="avatar-small" alt="">
          <span class="status-dot ${isOn ? 'online-dot' : 'offline-dot'}" data-uid="${other._id}"></span>
        </div>
        <div class="chat-meta">
          <div class="chat-username">${escapeHtml(other.username)}</div>
          <div class="chat-preview">${lastMsg ? escapeHtml(lastMsg.text.slice(0,38)) : "No messages yet"}</div>
        </div>
      </div>
      <div class="chat-right">
        <span class="chat-time">${lastMsg ? previewTime(lastMsg.createdAt) : ""}</span>
        <span class="unread-badge ${count > 0 ? 'visible' : ''}" id="unread-${chat._id}">${count > 0 ? count : ""}</span>
      </div>
    `;
    div.addEventListener("click", () => { closeSidebar(); openChat(chat); });
    document.getElementById("chatList").appendChild(div);
  });
}

// ============================
// LOAD ALL USERS
// ============================
async function loadAllUsers() {
  try {
    const res   = await fetch(`${API_URL}/api/users`, { headers: { Authorization: "Bearer " + token } });
    const users = await res.json();
    const list  = document.getElementById("allUsersList");
    list.innerHTML = "";
    const others = users.filter(u => u._id !== user._id);
    if (!others.length) { list.innerHTML = `<div style="padding:24px;text-align:center;color:#6666aa;font-size:13px;">No other users yet.</div>`; return; }
    others.forEach(u => {
      const isOn = onlineUsers.includes(u._id);
      const div  = document.createElement("div");
      div.className = "chat-item";
      div.innerHTML = `
        <div class="chat-left">
          <div class="av-wrap">
            <img src="${u.avatar || avatarPlaceholder(u.username)}" class="avatar-small" alt="">
            <span class="status-dot ${isOn ? 'online-dot' : 'offline-dot'}" data-uid="${u._id}"></span>
          </div>
          <div class="chat-meta">
            <div class="chat-username">${escapeHtml(u.username)}</div>
            <div class="chat-preview">${isOn ? "● Online" : "Offline"}</div>
          </div>
        </div>
      `;
      div.addEventListener("click", () => { closeSidebar(); createOrOpenChat(u._id); });
      list.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

// ============================
// SEARCH
// ============================
let searchDebounce;
document.getElementById("userSearch").addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  const val = e.target.value.trim();
  if (!val) { loadChats(); return; }
  searchDebounce = setTimeout(async () => {
    const res   = await fetch(`${API_URL}/api/users?search=${encodeURIComponent(val)}`, { headers: { Authorization: "Bearer " + token } });
    const users = await res.json();
    const chatList = document.getElementById("chatList");
    document.getElementById("allUsersList").classList.add("hidden");
    chatList.classList.remove("hidden");
    document.getElementById("tabChats").classList.add("active");
    document.getElementById("tabAll").classList.remove("active");
    chatList.innerHTML = "";
    const others = users.filter(u => u._id !== user._id);
    if (!others.length) { chatList.innerHTML = `<div style="padding:20px;text-align:center;color:#6666aa;font-size:13px;">No users found</div>`; return; }
    others.forEach(u => {
      const div = document.createElement("div");
      div.className = "chat-item";
      div.innerHTML = `
        <div class="chat-left">
          <div class="av-wrap"><img src="${u.avatar || avatarPlaceholder(u.username)}" class="avatar-small" alt=""></div>
          <div class="chat-meta"><div class="chat-username">${escapeHtml(u.username)}</div><div class="chat-preview">Tap to chat</div></div>
        </div>
      `;
      div.addEventListener("click", () => { closeSidebar(); createOrOpenChat(u._id); document.getElementById("userSearch").value = ""; loadChats(); });
      chatList.appendChild(div);
    });
  }, 300);
});

async function createOrOpenChat(userId) {
  const res  = await fetch(`${API_URL}/api/chats`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ userId })
  });
  const chat = await res.json();
  await loadChats();
  openChat(chat);
}

// ============================
// OPEN CHAT
// ============================
function openChat(chat) {
  currentChat = chat;
  chatWindow.classList.remove("no-chat");

  const other = chat.participants.find(p => p._id !== user._id);
  const isOn  = onlineUsers.includes(other._id);

  document.getElementById("chatAvatar").src = other.avatar || avatarPlaceholder(other.username);
  document.getElementById("chatUsername").innerText = other.username;
  const st = document.getElementById("chatStatus");
  st.textContent = isOn ? "Online" : "Offline";
  st.className   = isOn ? "online" : "";

  unreadCounts[chat._id] = 0;
  const badge = document.getElementById(`unread-${chat._id}`);
  if (badge) { badge.innerText = ""; badge.classList.remove("visible"); }

  document.querySelectorAll(".chat-item").forEach(el => el.classList.remove("active-chat"));
  const active = document.querySelector(`[data-chat-id="${chat._id}"]`);
  if (active) active.classList.add("active-chat");

  socket.emit("joinChat", chat._id);
  loadMessages(chat._id);
  markAsSeen(chat._id);
  if (window.innerWidth > 640) document.getElementById("messageInput").focus();
}

// ============================
// MESSAGES
// ============================
const messagesContainer = document.getElementById("messages");

async function loadMessages(chatId) {
  const res  = await fetch(`${API_URL}/api/messages/${chatId}`, { headers: { Authorization: "Bearer " + token } });
  const msgs = await res.json();
  messagesContainer.innerHTML = "";
  let lastDate = null;
  msgs.forEach(msg => {
    const d = new Date(msg.createdAt).toDateString();
    if (d !== lastDate) {
      addDateSep(msg.createdAt);
      lastDate = d;
    }
    addMessageToUI(msg, false);
  });
  scrollToBottom();
}

function addDateSep(date) {
  const div = document.createElement("div");
  div.className = "date-sep";
  div.textContent = formatDateLabel(date);
  messagesContainer.appendChild(div);
}

function addMessageToUI(msg, animate = true) {
  // Date separator for new day
  if (animate) {
    const d = new Date(msg.createdAt).toDateString();
    const lastMsg = messagesContainer.querySelector(".message:last-of-type");
    if (lastMsg) {
      const prevDate = new Date(lastMsg.dataset.ts).toDateString();
      if (prevDate !== d) addDateSep(msg.createdAt);
    }
  }

  const div = document.createElement("div");
  div.classList.add("message");
  const isSender = msg.senderId._id === user._id || msg.senderId === user._id;
  div.classList.add(isSender ? "sent" : "received");
  div.dataset.ts = msg.createdAt;
  if (!animate) div.style.animation = "none";

  div.innerHTML = `
    ${escapeHtml(msg.text)}
    <div class="msg-footer">
      <span class="msg-time">${formatTime(msg.createdAt)}</span>
      ${isSender ? `<span class="tick ${msg.seen ? 'seen' : ''}">✔✔</span>` : ""}
    </div>
  `;
  messagesContainer.appendChild(div);
  if (animate) scrollToBottom();
}

function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

// ============================
// SEND MESSAGE
// ============================
const messageInput = document.getElementById("messageInput");
const sendBtn      = document.getElementById("sendBtn");

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChat) return;
  messageInput.value = "";
  emojiPicker.classList.remove("open");

  const res  = await fetch(`${API_URL}/api/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ chatId: currentChat._id, text })
  });
  const msg = await res.json();
  addMessageToUI(msg, true);

  const idx = allChats.findIndex(c => c._id === currentChat._id);
  if (idx !== -1) { allChats[idx].latestMessage = msg; renderChatList(allChats); }
}

// ============================
// INCOMING MESSAGES
// ============================
socket.on("messageReceived", (newMsg) => {
  const chatId = newMsg.chatId._id || newMsg.chatId;

  const idx = allChats.findIndex(c => c._id === chatId);
  if (idx !== -1) allChats[idx].latestMessage = newMsg;

  if (currentChat && currentChat._id === chatId) {
    addMessageToUI(newMsg, true);
    markAsSeen(chatId);
  } else {
    unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1;
    const badge = document.getElementById(`unread-${chatId}`);
    if (badge) { badge.innerText = unreadCounts[chatId]; badge.classList.add("visible"); }
    else loadChats();
    showToast(`${newMsg.senderId?.username || "Someone"}: ${newMsg.text.slice(0,40)}`, "💬");
    playNotif();
  }
  renderChatList(allChats);
});

// ============================
// TYPING
// ============================
messageInput.addEventListener("input", () => {
  if (!currentChat) return;
  socket.emit("typing", { chatId: currentChat._id, senderId: user._id });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("stopTyping", { chatId: currentChat._id }), 1000);
});
socket.on("typing",     () => { document.getElementById("typingIndicator").innerText = "Typing…"; });
socket.on("stopTyping", () => { document.getElementById("typingIndicator").innerText = ""; });

// ============================
// SEEN
// ============================
async function markAsSeen(chatId) {
  await fetch(`${API_URL}/api/messages/seen`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ chatId })
  });
}
socket.on("messagesSeen", () => { if (currentChat) loadMessages(currentChat._id); });

// ============================
// EMOJI PICKER
// ============================
const emojiPicker = document.getElementById("emojiPicker");
const EMOJIS = ["😊","😂","❤️","😍","🔥","👍","😎","🙏","😭","😅","🤔","😆","🥰","😜","🤣","✨","🎉","💯","👏","🤩","😴","🥺","😤","🤦","🎶","💪","🌟","🚀","👀","💀","😱","🫡","😇","🤗","💬","⚡","🌈","🎯","💡","🍕","😋","🥳","😌","🫶","🤝","👋","💥","🎁","🏆","🌙"];
EMOJIS.forEach(em => {
  const s = document.createElement("span");
  s.textContent = em;
  s.onclick = () => { messageInput.value += em; messageInput.focus(); };
  emojiPicker.appendChild(s);
});
document.getElementById("emojiToggle").addEventListener("click", e => {
  e.stopPropagation();
  emojiPicker.classList.toggle("open");
});
document.addEventListener("click", () => emojiPicker.classList.remove("open"));

// ============================
// LOGOUT
// ============================
document.getElementById("logoutBtn").addEventListener("click", () => {
  socket.disconnect(); localStorage.clear(); window.location.href = "index.html";
});

// ============================
// AVATAR UPLOAD
// ============================
const profileAvatar = document.getElementById("profileAvatar");
const avatarInput   = document.getElementById("avatarInput");

profileAvatar.src = user.avatar || avatarPlaceholder(user.username);
document.getElementById("avatarWrapper").addEventListener("click", () => avatarInput.click());

avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast("Image too large (max 10MB)", "⚠️"); return; }
  showToast("Uploading…", "⏳");
  const reader = new FileReader();
  reader.onloadend = async () => {
    try {
      const res  = await fetch(`${API_URL}/api/users/avatar`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ image: reader.result })
      });
      const data = await res.json();
      if (res.ok) {
        profileAvatar.src = data.avatar;
        user.avatar = data.avatar;
        localStorage.setItem("user", JSON.stringify(user));
        showToast("Avatar updated!", "✅");
      } else showToast(data.message || "Upload failed", "❌");
    } catch { showToast("Upload failed. Try again.", "❌"); }
  };
  reader.readAsDataURL(file);
  avatarInput.value = "";
});

// ============================
// INIT
// ============================
loadChats();
