// ============================
// CONFIG
// ============================
// Change this to your Render backend URL after deploying
const API_URL = "https://YOUR-APP-NAME.onrender.com";
// For local dev, comment the line above and uncomment below:
// const API_URL = "http://localhost:5000";


// ============================
// TOGGLE LOGIN / REGISTER
// ============================

const toggleBtn    = document.getElementById("toggleBtn");
const loginForm    = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

let isLogin = true;

toggleBtn.addEventListener("click", () => {
  loginForm.classList.toggle("active");
  registerForm.classList.toggle("active");
  toggleBtn.innerText = isLogin ? "Switch to Login" : "Switch to Register";
  isLogin = !isLogin;
});

// ============================
// LOGIN
// ============================

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = loginForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Logging in…";

  const email    = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const res  = await fetch(`${API_URL}/api/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user",  JSON.stringify(data));
      window.location.href = "dashboard.html";
    } else {
      alert(data.message);
    }
  } catch {
    alert("Server not reachable. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
});

// ============================
// REGISTER
// ============================

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = registerForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Creating account…";

  const username = document.getElementById("registerUsername").value;
  const email    = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;

  try {
    const res  = await fetch(`${API_URL}/api/auth/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, email, password }),
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user",  JSON.stringify(data));
      window.location.href = "dashboard.html";
    } else {
      alert(data.message);
    }
  } catch {
    alert("Server not reachable. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Register";
  }
});
