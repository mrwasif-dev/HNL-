# HNL Hi-Tech — FSR Bot

A WhatsApp-connected **Field Service Report (FSR)** system for HNL Hi-Tech (Pvt) Ltd, built on [Baileys](https://github.com/WhiskeySockets/Baileys) with MongoDB-backed sessions.

Field engineers fill in a mobile-friendly form on the web dashboard — name, region, site ID, date, and whatever parts/consumables were used on that visit — and on submit the bot formats a clean report and posts it directly to your WhatsApp group. No more typing the same report by hand in WhatsApp every time.

There is **no auto-forwarding** in this build — the bot's only job is linking to WhatsApp and sending FSR reports.

## ✨ Features

- 🔐 Dashboard login system — first visit creates the admin username/password (stored hashed in MongoDB), later visits log in with it; session survives restarts
- 📱 Link the bot to a WhatsApp number by scanning a QR code from the **Connect** tab
- 📋 **FSR** tab — the full site-visit form:
  - Name, Region (Bahawalpur 1 / Bahawalpur 2 / manual), Site ID (6 characters, auto-uppercased), Date
  - Engine Oil (6–10 L presets, No Oil Change, or manual entry)
  - Oil Filter, Fuel Filter, Air Filter (preset part numbers or No Change)
  - Radiator Coolant, Silicon, Cotton Waste, PVC Tape, Cable Tie — all optional, left blank if unused
  - **Other Store Items** and **Service Items** — add as many free-form rows as needed
- ✅ On submit, only the fields that were actually filled in (or changed from "No Change") are included in the report — everything else is skipped automatically
- 🗄️ Session and settings stored in MongoDB — survives restarts and redeploys
- 🩺 Health check and keep-alive endpoints for uptime monitoring
- ☁️ Ready to deploy on Heroku, Docker, or any Node.js host

## 🚀 Deploy

### One-click (Heroku)

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/mrwasif-dev/Muzammil-MD-V3)

### Docker

```bash
docker build -t hnl-hitech-fsr .
docker run -p 3000:3000 --env-file .env hnl-hitech-fsr
```

### Manual (VPS / local)

```bash
git clone <this-repo>
cd Muzammil-MD-V3-main
cp .env.example .env   # then fill in your values
npm install
npm start
```

Open `http://localhost:3000`:

1. First visit — create your admin username/password.
2. Go to **Connect** and scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device).
3. Go to **Account**, and set the **FSR WhatsApp Group** — send `!gjid` from any chat to the linked number to list your groups and their JIDs, paste the right one in, and save.
4. Go to **FSR**, fill in a report, and hit **Submit FSR** — it lands in the group immediately.

## ⚙️ Environment Variables

| Variable            | Required | Description                                                              |
|-----------------------|:--------:|----------------------------------------------------------------------------|
| `MONGODB_URI`        | ✅       | MongoDB connection string (session + dashboard login + FSR settings)      |
| `PORT`               | ❌       | Server port (defaults to `3000`)                                          |
| `SESSION_ID`         | ❌       | Fixed session id; leave blank to pair fresh via QR                        |
| `JWT_SECRET`         | ❌       | Secret used to sign dashboard login sessions — set a long random value    |
| `COMPANY_NAME`       | ❌       | Company name shown at the top of every report (defaults to HNL Hi-Tech)   |
| `FSR_GROUP_JID`      | ❌       | Fallback WhatsApp group JID (the dashboard's Account tab setting takes priority once saved) |

## 📁 Project Structure

```
.
├── index.js               # Server entry point, WhatsApp session + FSR API
├── muzammil.js             # Config loader (session id, Mongo URL, company name)
├── muzammillib/
│   ├── session.js          # Baileys connection lifecycle
│   ├── mongoAuth.js        # MongoDB-backed auth state for Baileys
│   ├── auth.js              # Dashboard login (bcrypt + JWT cookie) helpers
│   └── database.js         # Mongoose schemas + DB helpers (dashboard users, FSR group config, misc bot data)
├── public/
│   ├── index.html          # Web dashboard (Connect / FSR / Account tabs)
│   ├── css/dashboard.css   # HNL red & white theme
│   └── js/dashboard.js     # Dashboard + FSR form logic
├── app.json                # Heroku Button configuration
├── Dockerfile               # Container build
├── Procfile                 # Process definition (web: npm start)
└── ecosystem.config.json    # PM2 process configuration
```

## 🔌 API Endpoints

| Method | Route              | Purpose                                    |
|--------|---------------------|---------------------------------------------|
| GET    | `/ping`             | Simple keep-alive check                    |
| GET    | `/api/status`       | Current WhatsApp connection status / QR    |
| GET    | `/api/health`       | Health check                               |
| POST   | `/api/generate-qr`  | Generate a new pairing QR code             |
| POST   | `/api/restart`      | Restart the session                        |
| POST   | `/api/logout`       | Log out and clear the WhatsApp session     |
| GET    | `/api/sessions`     | List active sessions                       |
| GET    | `/api/fsr/config`   | Get the configured FSR WhatsApp group      |
| POST   | `/api/fsr/config`   | Save the FSR WhatsApp group JID            |
| POST   | `/api/fsr/submit`   | Submit an FSR — sends the formatted report |

## 📄 License

MIT
