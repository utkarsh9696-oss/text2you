// ============================
// CONFIG
// ============================
const API_URL = "https://textify-zluc.onrender.com";

// ============================
// INITIALIZATION - FIXED VERSION
// ============================

const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));

// FIX: Check if user exists before trying to use it
if (!token || !user || !user.username) {
  localStorage.clear();
  window.location.href = "index.html";
}

// Only run the rest if we have a valid user
document.getElementById("currentUsername").innerText = user.username;

const socket = io(API_URL);
socket.emit("setup", user);

let unreadCounts = {};
let onlineUsers  = [];
let currentChat  = null;
let typingTimeout = null;

// ============================
// TOAST NOTIFICATIONS
// ============================

function showToast(message, emoji = "💬") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.classList.add("toast");
  toast.innerHTML = `<span>${emoji}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ============================
// MOBILE SIDEBAR TOGGLE
// ============================

const sidebar    = document.getElementById("sidebar");
const overlay    = document.getElementById("sidebarOverlay");
const chatWindow = document.getElementById("chatWindow");

function openSidebar() {
  sidebar.classList.add("open");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  sidebar.classList.remove("open");
  overlay.classList.remove("active");
  document.body.style.overflow = "";
}

overlay.addEventListener("click", closeSidebar);

document.getElementById("backBtn").addEventListener("click", () => {
  currentChat = null;
  chatWindow.classList.add("no-chat");
  openSidebar();
});

// ============================
// ONLINE SYSTEM
// ============================

socket.on("onlineUsers", (users) => {
  onlineUsers = users;
  updateOnlineStatusUI();
});

socket.on("userOnline", (userId) => {
  if (!onlineUsers.includes(userId)) onlineUsers.push(userId);
  updateOnlineStatusUI();
});

socket.on("userOffline", (userId) => {
  onlineUsers = onlineUsers.filter((id) => id !== userId);
  updateOnlineStatusUI();
});

// ============================
// LOAD CHATS
// ============================

const chatList = document.getElementById("chatList");

async function loadChats() {
  const res = await fetch(`${API_URL}/api/chats`, {
    headers: { Authorization: "Bearer " + token },
  });
  const chats = await res.json();
  renderChatList(chats);
}

function renderChatList(chats) {
  chatList.innerHTML = "";

  chats.forEach((chat) => {
    const otherUser = chat.participants.find((p) => p._id !== user._id);
    const div = document.createElement("div");
    div.classList.add("chat-item");
    div.setAttribute("data-chat-id", chat._id);
    div.setAttribute("data-user-id", otherUser._id);

    if (currentChat && currentChat._id === chat._id) {
      div.classList.add("active-chat");
    }

    const count = unreadCounts[chat._id] || 0;
    const isOnline = onlineUsers.includes(otherUser._id);

    div.innerHTML = `
      <div class="chat-left">
        <div style="position:relative;flex-shrink:0;">
          <img src="${otherUser.avatar || avatarPlaceholder(otherUser.username)}" class="avatar-small" alt="">
          <span class="user-status-dot ${isOnline ? 'online-dot' : 'offline-dot'}"
                id="status-${otherUser._id}"
                style="position:absolute;bottom:1px;right:1px;"></span>
        </div>
        <span class="chat-username">${escapeHtml(otherUser.username)}</span>
      </div>
      <div class="chat-right">
        <span class="unread-badge ${count > 0 ? 'visible' : ''}" id="unread-${chat._id}">
          ${count > 0 ? count : ""}
        </span>
      </div>
    `;

    div.addEventListener("click", () => {
      closeSidebar();
      openChat(chat);
    });

    chatList.appendChild(div);
  });
}

loadChats();

// ============================
// PLACEHOLDER AVATAR (initials)
// ============================

function avatarPlaceholder(username) {
  const letter = (username || "?")[0].toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>
    <rect width='40' height='40' rx='20' fill='%23222240'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle'
      fill='%2300c8b4' font-size='18' font-family='Segoe UI,sans-serif' font-weight='700'>${letter}</text>
  </svg>`;
  return `data:image/svg+xml,${svg}`;
}

// ============================
// UPDATE ONLINE UI
// ============================

function updateOnlineStatusUI() {
  document.querySelectorAll(".user-status-dot").forEach((dot) => {
    const id = dot.id.replace("status-", "");
    dot.classList.toggle("online-dot",  onlineUsers.includes(id));
    dot.classList.toggle("offline-dot", !onlineUsers.includes(id));
  });

  if (currentChat) {
    const otherUser = currentChat.participants.find((p) => p._id !== user._id);
    const status = document.getElementById("chatStatus");
    if (onlineUsers.includes(otherUser._id)) {
      status.innerText = "Online";
      status.style.color = "#00e676";
    } else {
      status.innerText = "Offline";
      status.style.color = "#7777a0";
    }
  }
}

// ============================
// OPEN CHAT
// ============================

function openChat(chat) {
  currentChat = chat;
  chatWindow.classList.remove("no-chat");

  const otherUser = chat.participants.find((p) => p._id !== user._id);
  document.getElementById("chatUsername").innerText = otherUser.username;
  document.getElementById("chatAvatar").src =
    otherUser.avatar || avatarPlaceholder(otherUser.username);

  // Reset unread
  unreadCounts[chat._id] = 0;
  const badge = document.getElementById(`unread-${chat._id}`);
  if (badge) { badge.innerText = ""; badge.classList.remove("visible"); }

  // Highlight active
  document.querySelectorAll(".chat-item").forEach((el) => el.classList.remove("active-chat"));
  const activeItem = document.querySelector(`[data-chat-id="${chat._id}"]`);
  if (activeItem) activeItem.classList.add("active-chat");

  socket.emit("joinChat", chat._id);
  loadMessages(chat._id);
  markAsSeen(chat._id);

  if (window.innerWidth > 640) {
    document.getElementById("messageInput").focus();
  }
}

// ============================
// SEARCH USERS
// ============================

const userSearchInput = document.getElementById("userSearch");

userSearchInput.addEventListener("input", async (e) => {
  const value = e.target.value.trim();
  if (!value) { loadChats(); return; }

  try {
    const res = await fetch(`${API_URL}/api/users?search=${value}`, {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) return;
    const users = await res.json();
    renderSearchResults(users);
  } catch (error) {
    console.error("Search error:", error);
  }
});

function renderSearchResults(users) {
  chatList.innerHTML = "";

  if (users.length === 0) {
    chatList.innerHTML = `<div style="padding:20px;text-align:center;color:#7777a0;font-size:13px;">No users found</div>`;
    return;
  }

  users.forEach((userItem) => {
    const div = document.createElement("div");
    div.classList.add("chat-item");

    div.innerHTML = `
      <div class="chat-left">
        <img src="${userItem.avatar || avatarPlaceholder(userItem.username)}" class="avatar-small" alt="">
        <span class="chat-username">${escapeHtml(userItem.username)}</span>
      </div>
    `;

    div.addEventListener("click", () => {
      closeSidebar();
      createOrOpenChat(userItem._id);
    });

    chatList.appendChild(div);
  });
}

async function createOrOpenChat(userId) {
  const res = await fetch(`${API_URL}/api/chats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ userId }),
  });

  const chat = await res.json();
  openChat(chat);
  loadChats();
  userSearchInput.value = "";
}

// ============================
// LOGOUT
// ============================

document.getElementById("logoutBtn").addEventListener("click", () => {
  socket.disconnect();
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "index.html";
});

// ============================
// LOAD MESSAGES
// ============================

const messagesContainer = document.getElementById("messages");

async function loadMessages(chatId) {
  const res = await fetch(`${API_URL}/api/messages/${chatId}`, {
    headers: { Authorization: "Bearer " + token },
  });
  const messages = await res.json();
  messagesContainer.innerHTML = "";
  messages.forEach((msg) => addMessageToUI(msg));
  scrollToBottom();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============================
// RENDER MESSAGE
// ============================

function addMessageToUI(msg) {
  const div = document.createElement("div");
  div.classList.add("message");

  const isSender = msg.senderId._id === user._id;
  div.classList.add(isSender ? "sent" : "received");

  div.innerHTML = `
    ${escapeHtml(msg.text)}
    ${isSender ? `<span class="tick ${msg.seen ? "seen" : ""}">✔✔</span>` : ""}
  `;

  messagesContainer.appendChild(div);
  scrollToBottom();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================
// SEND MESSAGE
// ============================

const messageInput = document.getElementById("messageInput");
const sendBtn      = document.getElementById("sendBtn");

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChat) return;

  messageInput.value = "";

  const res = await fetch(`${API_URL}/api/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ chatId: currentChat._id, text }),
  });

  const message = await res.json();
  addMessageToUI(message);
}

// ============================
// REAL-TIME MESSAGE RECEIVE
// ============================

socket.on("messageReceived", (newMessage) => {
  const chatId = newMessage.chatId._id || newMessage.chatId;

  if (!currentChat || currentChat._id !== chatId) {
    if (!unreadCounts[chatId]) unreadCounts[chatId] = 0;
    unreadCounts[chatId]++;

    const badge = document.getElementById(`unread-${chatId}`);
    if (badge) {
      badge.innerText = unreadCounts[chatId];
      badge.classList.add("visible");
    } else {
      loadChats();
    }

    const senderName = newMessage.senderId?.username || "Someone";
    showToast(`New message from ${senderName}`, "💬");
  } else {
    addMessageToUI(newMessage);
    markAsSeen(chatId);
  }
});

// ============================
// TYPING SYSTEM
// ============================

messageInput.addEventListener("input", () => {
  if (!currentChat) return;
  socket.emit("typing", { chatId: currentChat._id, senderId: user._id });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping", { chatId: currentChat._id, senderId: user._id });
  }, 1000);
});

socket.on("typing",     () => { document.getElementById("typingIndicator").innerText = "Typing…"; });
socket.on("stopTyping", () => { document.getElementById("typingIndicator").innerText = "";        });

// ============================
// SEEN SYSTEM
// ============================

async function markAsSeen(chatId) {
  await fetch(`${API_URL}/api/messages/seen`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ chatId }),
  });
}

socket.on("messagesSeen", () => {
  if (currentChat) loadMessages(currentChat._id);
});

// ============================
// AVATAR UPLOAD
// ============================

const profileAvatar = document.getElementById("profileAvatar");
const avatarInput   = document.getElementById("avatarInput");
const avatarWrapper = document.getElementById("avatarWrapper");

profileAvatar.src = user.avatar || avatarPlaceholder(user.username);

avatarWrapper.addEventListener("click", () => avatarInput.click());

avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please select an image file", "⚠️"); return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("Image must be under 10MB", "⚠️"); return;
  }

  showToast("Uploading picture…", "⏳");

  const reader = new FileReader();
  reader.onloadend = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users/avatar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ image: reader.result }),
      });
      const data = await res.json();
      if (res.ok) {
        profileAvatar.src = data.avatar;
        user.avatar = data.avatar;
        localStorage.setItem("user", JSON.stringify(user));
        showToast("Profile picture updated!", "✅");
      } else {
        showToast(data.message || "Upload failed", "❌");
      }
    } catch {
      showToast("Upload failed. Try again.", "❌");
    }
  };
  reader.readAsDataURL(file);
  avatarInput.value = "";
});