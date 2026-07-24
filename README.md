# HNL Hi-Tech — FSR Bot

A WhatsApp-connected **Field Service Report (FSR)** system for HNL Hi-Tech (Pvt) Ltd, built on [Baileys](https://github.com/WhiskeySockets/Baileys) with MongoDB-backed sessions.

Field engineers log in with their **ERP ID**, fill in a mobile-friendly form — name, region, site ID, date, and whatever parts/consumables were used on that visit — and on submit the bot formats a clean report and posts it directly to your WhatsApp group.

There is **no auto-forwarding** and **no admin signup** in this build — the bot's only job is linking to WhatsApp and sending FSR reports, and the only people who can log in are the ERP IDs you've explicitly allowed.

## ✨ Features

- 🔐 **ERP ID login** — no dashboard account creation. Only ERP IDs listed in the `ERP_IDS` config var can log in, all sharing one password (`ERP_PASSWORD`)
- 📱 Link the bot to a WhatsApp number by scanning a QR code from the **Connect** tab
- 📋 **FSR** tab — the full site-visit form:
  - Name, Region (Bahawalpur 1 / Bahawalpur 2 / manual), Site ID (6 characters, auto-uppercased), Date
  - Engine Oil (6–10 L presets, No Oil Change, or manual entry)
  - Oil Filter, Fuel Filter, Air Filter (preset part numbers or No Change)
  - Radiator Coolant, Silicon, Cotton Waste, PVC Tape, Cable Tie — all optional, left blank if unused
  - **Other Store Items** and **Service Items** — type a name, tap ✓ to add it as a card, edit or delete it, and fill in its quantity — add as many as needed
- ✅ On submit, only the fields that were actually filled in (or changed from "No Change") are included in the report — everything else is skipped automatically
- 🗄️ Session and FSR group settings stored in MongoDB — survives restarts and redeploys
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

1. Log in with an ERP ID you've added to `ERP_IDS` and the shared `ERP_PASSWORD`.
2. Go to **Connect** and scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device).
3. Go to **Account**, and set the **FSR WhatsApp Group** — send `!gjid` from any chat to the linked number to list your groups and their JIDs, paste the right one in, and save.
4. Go to **FSR**, fill in a report, and hit **Submit FSR** — it lands in the group immediately.

## 👤 Adding / removing engineers

Nobody signs up. To let someone log in, add their ERP ID to the `ERP_IDS` config var (comma-separated), e.g.:

```
ERP_IDS=1007015,1315964,1420078
```

Everyone shares the one password set in `ERP_PASSWORD`. To revoke someone, just remove their ID from the list and redeploy/restart.

## ⚙️ Environment Variables

| Variable            | Required | Description                                                              |
|-----------------------|:--------:|----------------------------------------------------------------------------|
| `MONGODB_URI`        | ✅       | MongoDB connection string (session + FSR group settings)                  |
| `ERP_IDS`            | ✅       | Comma-separated ERP IDs allowed to log in, e.g. `1007015,1315964`         |
| `ERP_PASSWORD`       | ❌       | Shared password for all ERP IDs above (defaults to `1234hnl`)             |
| `PORT`               | ❌       | Server port (defaults to `3000`)                                          |
| `SESSION_ID`         | ❌       | Fixed session id; leave blank to pair fresh via QR                        |
| `JWT_SECRET`         | ❌       | Secret used to sign login sessions — set a long random value              |
| `FSR_GROUP_JID`      | ❌       | Fallback WhatsApp group JID (the dashboard's Account tab setting takes priority once saved) |

## 📁 Project Structure

Everything sits in one flat folder — no nested library folders.

```
.
├── index.js               # Server entry point, WhatsApp session + FSR API
├── muzammil.js             # Config loader (session id, Mongo URL, ERP IDs/password)
├── session.js              # Baileys connection lifecycle
├── mongoAuth.js            # MongoDB-backed auth state for Baileys
├── auth.js                  # ERP-ID login (JWT cookie) helpers
├── database.js             # Mongoose schemas + DB helpers (FSR group config, misc bot data)
├── public/
│   ├── index.html          # Web dashboard (Connect / FSR / Account tabs)
│   ├── style.css           # HNL red & white theme
│   └── app.js              # Dashboard + FSR form logic
├── app.json                 # Heroku Button configuration
├── Dockerfile                # Container build
├── Procfile                  # Process definition (web: npm start)
└── ecosystem.config.json     # PM2 process configuration
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
| POST   | `/api/auth/login`   | Log in with ERP ID + password              |
| GET    | `/api/fsr/config`   | Get the configured FSR WhatsApp group      |
| POST   | `/api/fsr/config`   | Save the FSR WhatsApp group JID            |
| POST   | `/api/fsr/submit`   | Submit an FSR — sends the formatted report |

## 📄 License

MIT
