# MyText — Setup & Deployment Guide

## Project Structure
```
mytext-new/
├── backend/          ← Node.js/Express API (deploy to Render)
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/       (db.js, cloudinary.js)
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   └── routes/
│   ├── package.json
│   ├── .env          ← YOUR secrets go here (never commit this)
│   └── .gitignore
└── frontend/         ← Static HTML/CSS/JS (deploy to Render Static Site)
    ├── index.html
    ├── dashboard.html
    ├── css/
    └── js/
```

---

## Step 1 — Fill in your .env

Open `backend/.env` and replace all placeholder values:

```
MONGO_URI=mongodb+srv://youruser:yourpassword@yourcluster.mongodb.net/mytext?retryWrites=true&w=majority
JWT_SECRET=some_long_random_string_here
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLIENT_URL=https://YOUR-FRONTEND-NAME.onrender.com
```

### Where to get each value:
- **MONGO_URI** → MongoDB Atlas → your cluster → Connect → Drivers → copy the string
- **JWT_SECRET** → Make up any long random string (e.g. visit https://www.uuidgenerator.net/ and copy a UUID)
- **CLOUDINARY_*** → https://cloudinary.com → Dashboard → copy Cloud name, API Key, API Secret

---

## Step 2 — Update the frontend API_URL

In both `frontend/js/auth.js` and `frontend/js/dashboard.js`, find this line at the top:

```js
const API_URL = "https://YOUR-APP-NAME.onrender.com";
```

Replace `YOUR-APP-NAME` with your actual Render backend service name (you'll get this in Step 4).

Also update in `frontend/index.html`:
```js
const API_URL = window.MYTEXT_API_URL || "https://YOUR-APP-NAME.onrender.com";
```

---

## Step 3 — Push to GitHub

1. Create a new GitHub repo (e.g. `mytext-app`)
2. Initialize git in the project root:

```bash
cd mytext-new
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/mytext-app.git
git push -u origin main
```

> ⚠️ Make sure `.gitignore` contains `.env` — your secrets should NEVER be pushed.

---

## Step 4 — Deploy Backend on Render

1. Go to https://render.com → New → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Environment**: Node
4. Under **Environment Variables**, add each key from your `.env`:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `CLIENT_URL` → set this to your frontend URL (you'll get it in Step 5; you can update it later)
   - `PORT` → `5000` (or leave empty, Render sets its own)
5. Click **Deploy** — note your backend URL: `https://your-backend-name.onrender.com`

---

## Step 5 — Deploy Frontend on Render

1. Go to Render → New → **Static Site**
2. Connect the same GitHub repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: *(leave blank)*
   - **Publish Directory**: `.`  (or `frontend` if Render asks for it relative to repo root)
4. Click **Deploy** — note your frontend URL: `https://your-frontend-name.onrender.com`

---

## Step 6 — Update CORS

Go back to your **backend service** on Render → Environment → update `CLIENT_URL` to your actual frontend URL → **Save** → Render will redeploy automatically.

---

## Local Development

```bash
# Install dependencies
cd backend
npm install

# Start backend (reads .env automatically)
npm run dev   # uses nodemon for hot-reload
# or
npm start     # plain node

# Open frontend in browser — just open frontend/index.html
# OR use VS Code Live Server extension
```

For local dev, in `auth.js` and `dashboard.js` swap:
```js
// const API_URL = "https://YOUR-APP-NAME.onrender.com";
const API_URL = "http://localhost:5000";
```

---

## Common Issues

| Problem | Fix |
|---|---|
| CORS error | Check `CLIENT_URL` in .env matches your frontend URL exactly |
| MongoDB connection failed | Check MONGO_URI, whitelist `0.0.0.0/0` in Atlas Network Access |
| Avatar upload fails | Verify all 3 Cloudinary env vars are set correctly |
| Render cold start (50s delay) | Free tier sleeps after inactivity — this is normal |
