require('dotenv').config();
const {
    DisconnectReason,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    makeWASocket,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const P = require('pino');
const QRCode = require('qrcode');

const { muzammil_connectSession, muzammil_clearSession } = require('./muzammillib/session');
const {
    muzammil_connectDatabase,
    muzammil_isDbConnected,
    muzammil_countDashUsers,
    muzammil_getFirstDashUser,
    muzammil_createDashUser,
    muzammil_getDashUserByUsername,
    muzammil_getFsrConfig,
    muzammil_saveFsrConfig
} = require('./muzammillib/database');
const {
    hashPassword,
    verifyPassword,
    signToken,
    setAuthCookie,
    clearAuthCookie,
    requireAuth
} = require('./muzammillib/auth');
const config = require('./muzammil');

// Time the process actually started - used for a truthful uptime display
const BOT_START_TIME = Date.now();

// Load persistent config
try {
    if (fs.existsSync(path.join(__dirname, 'botConfig.json'))) {
        const savedConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'botConfig.json')));
        Object.assign(config, savedConfig);
    }
} catch (e) {
    console.error('Failed to load botConfig.json:', e);
}

const muzammil_app = express();
const muzammil_port = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// SESSION STATE
// -----------------------------------------------------------------------------
const sessions = new Map();
const qrTimeouts = new Map();
const keepAliveIntervals = new Map();

// Middleware
muzammil_app.use(express.json({ limit: '1mb' }));
muzammil_app.use(cookieParser());
muzammil_app.use(express.static(path.join(__dirname, 'public')));

// Keep-Alive Route
muzammil_app.get('/ping', (req, res) => res.status(200).send('pong'));

// -----------------------------------------------------------------------------
// FSR CONFIG CACHE (which WhatsApp group the submitted FSR reports go to)
// -----------------------------------------------------------------------------
let fsrConfigCache = null; // { username, groupJid }

async function refreshFsrConfigCache(username) {
    try {
        const cfg = await muzammil_getFsrConfig(username);
        if (cfg) {
            fsrConfigCache = {
                username,
                groupJid: cfg.groupJid || ''
            };
        }
    } catch (e) {
        console.error('Failed to refresh FSR config cache:', e.message);
    }
}

function getFsrGroupJid() {
    return (fsrConfigCache && fsrConfigCache.groupJid) ? fsrConfigCache.groupJid : (process.env.FSR_GROUP_JID || '');
}

// -----------------------------------------------------------------------------
// FSR MESSAGE BUILDER
// Takes the validated form payload from the dashboard and turns it into a
// clean WhatsApp-ready report. Only fields the user actually filled in (or
// changed from "No Change") are included — everything else is skipped.
// -----------------------------------------------------------------------------
function formatDateReadable(isoDate) {
    try {
        const d = new Date(isoDate + 'T00:00:00');
        if (isNaN(d.getTime())) return isoDate;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
    } catch (e) {
        return isoDate;
    }
}

function buildFsrMessage(payload) {
    const lines = [];

    // Consumable / part lines — each only added if the user actually set it.
    if (payload.engineOil && payload.engineOil.trim()) {
        lines.push(`Engine Oil ,${payload.engineOil.trim()}`);
    }
    if (payload.oilFilter && payload.oilFilter !== 'none') {
        lines.push(`Oil Filter ${payload.oilFilter} ,01`);
    }
    if (payload.fuelFilter && payload.fuelFilter !== 'none') {
        lines.push(`Fuel Filter ${payload.fuelFilter} ,01`);
    }
    if (payload.airFilter && payload.airFilter !== 'none') {
        lines.push(`Air Filter ${payload.airFilter} ,01`);
    }
    if (payload.coolant && String(payload.coolant).trim()) {
        lines.push(`Radiator coolant ,${String(payload.coolant).trim()} ML`);
    }
    if (payload.silicon && String(payload.silicon).trim()) {
        lines.push(`Silicon ,${String(payload.silicon).trim()}`);
    }
    if (payload.cottonWaste && String(payload.cottonWaste).trim()) {
        lines.push(`Cotton waste ,${String(payload.cottonWaste).trim()}kg`);
    }
    if (payload.pvcTape && String(payload.pvcTape).trim()) {
        lines.push(`PVC tape ,${String(payload.pvcTape).trim()} piece`);
    }
    if (payload.cableTie && String(payload.cableTie).trim()) {
        lines.push(`Cable Tie ,${String(payload.cableTie).trim()} piece`);
    }

    const storeItems = Array.isArray(payload.manualItems)
        ? payload.manualItems.filter(i => i && i.name && String(i.name).trim())
        : [];
    const serviceItems = Array.isArray(payload.serviceItems)
        ? payload.serviceItems.filter(i => i && i.name && String(i.name).trim())
        : [];

    let msg = `*${config.companyName}*\n*Field Service Report*\n\n`;
    msg += `👤 Name: ${payload.name}\n`;
    msg += `📍 Region: ${payload.region}\n`;
    msg += `📅 Date: ${formatDateReadable(payload.date)}\n\n`;
    msg += `*Site ID: ${payload.siteId}*\n`;
    msg += `──────────────\n`;

    if (lines.length) {
        msg += lines.join('\n') + '\n';
    } else {
        msg += '_No store items used._\n';
    }

    if (storeItems.length) {
        msg += `\n*Other Store Items:*\n`;
        msg += storeItems.map(i => `${String(i.name).trim()} ,${String(i.qty || '1').trim()}`).join('\n') + '\n';
    }

    if (serviceItems.length) {
        msg += `\n*Service Items:*\n`;
        msg += serviceItems.map(i => `${String(i.name).trim()} ,${String(i.qty || '1').trim()}`).join('\n') + '\n';
    }

    msg += `──────────────`;

    return msg;
}

// Validates the incoming FSR payload. Returns an error string, or null if OK.
function validateFsrPayload(p) {
    if (!p || typeof p !== 'object') return 'Invalid submission';
    if (!p.name || !String(p.name).trim()) return 'Name is required';
    if (!p.region || !String(p.region).trim()) return 'Region is required';
    if (!p.siteId || !/^[A-Z][A-Z0-9]{5}$/.test(String(p.siteId).trim())) {
        return 'Site ID must be exactly 6 characters, starting with a letter (e.g. MBW001)';
    }
    if (!p.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date).trim())) return 'A valid date is required';
    return null;
}

// -----------------------------------------------------------------------------
// COMMAND HANDLER FUNCTIONS (utility commands — !gjid is how the admin finds
// the FSR WhatsApp group's JID to paste into the dashboard)
// -----------------------------------------------------------------------------

async function handlePingCommand(sock, from) {
    await sock.sendMessage(from, { text: "Pong ✅" });
}

async function handleJidCommand(sock, from) {
    await sock.sendMessage(from, { text: `${from}` });
}

async function handleGjidCommand(sock, from) {
    try {
        const groups = await sock.groupFetchAllParticipating();

        let response = "📌 *Groups List:*\n\n";
        let groupCount = 1;

        for (const [jid, group] of Object.entries(groups)) {
            const groupName = group.subject || "Unnamed Group";
            const participantsCount = group.participants ? group.participants.length : 0;

            response += `${groupCount}. *${groupName}*\n`;
            response += `   👥 Members: ${participantsCount}\n`;
            response += `   🆔: \`${jid}\`\n`;
            response += `   ──────────────\n\n`;

            groupCount++;
        }

        if (groupCount === 1) {
            response = "❌ No groups found. You are not in any groups.";
        } else {
            response += `\n*Total Groups: ${groupCount - 1}*`;
        }

        await sock.sendMessage(from, { text: response });
    } catch (error) {
        console.error('Error fetching groups:', error);
        await sock.sendMessage(from, {
            text: "❌ Error fetching groups list. Please try again later."
        });
    }
}

async function processCommand(sock, msg) {
    const from = msg.key.remoteJid;
    const text = msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

    if (!text || !text.startsWith('!')) return;

    const command = text.trim().toLowerCase();

    try {
        if (command === '!ping') {
            await handlePingCommand(sock, from);
        }
        else if (command === '!jid') {
            await handleJidCommand(sock, from);
        }
        else if (command === '!gjid') {
            await handleGjidCommand(sock, from);
        }
    } catch (error) {
        console.error('Command execution error:', error);
    }
}

// -----------------------------------------------------------------------------
// KEEP-ALIVE MECHANISM - PREVENTS 50-MINUTE TIMEOUT
// -----------------------------------------------------------------------------
function startKeepAlive(sessionId, sock) {
    if (keepAliveIntervals.has(sessionId)) {
        clearInterval(keepAliveIntervals.get(sessionId));
        keepAliveIntervals.delete(sessionId);
    }

    console.log(`🔄 Starting keep-alive for session: ${sessionId}`);

    const interval = setInterval(async () => {
        try {
            const session = sessions.get(sessionId);
            if (!session || !session.isConnected || !session.sock) {
                clearInterval(interval);
                keepAliveIntervals.delete(sessionId);
                return;
            }
            await session.sock.sendPresenceAvailable();
        } catch (error) {
            if (error.message?.includes('reconnecting')) {
                clearInterval(interval);
                keepAliveIntervals.delete(sessionId);
            }
        }
    }, 30000);

    keepAliveIntervals.set(sessionId, interval);
}

// -----------------------------------------------------------------------------
// SESSION MANAGEMENT WITH ENHANCED RECONNECTION
// -----------------------------------------------------------------------------
async function startSession(sessionId) {
    if (qrTimeouts.has(sessionId)) {
        clearTimeout(qrTimeouts.get(sessionId));
        qrTimeouts.delete(sessionId);
    }

    if (keepAliveIntervals.has(sessionId)) {
        clearInterval(keepAliveIntervals.get(sessionId));
        keepAliveIntervals.delete(sessionId);
    }

    if (sessions.has(sessionId)) {
        const existing = sessions.get(sessionId);
        if (existing.isConnected && existing.sock) {
            console.log(`Session ${sessionId} is already connected.`);
            startKeepAlive(sessionId, existing.sock);
            return;
        }

        if (existing.sock) {
            existing.sock.ev.removeAllListeners('connection.update');
            existing.sock.end(undefined);
            sessions.delete(sessionId);
        }
    }

    console.log(`🚀 Starting session: ${sessionId}`);

    const sessionState = {
        sock: null,
        isConnected: false,
        qr: null,
        reconnectAttempts: 0,
        lastQRTime: null,
        isConnecting: false,
        lastConnectionTime: null,
    };
    sessions.set(sessionId, sessionState);

    try {
        const { muzammil_sock, saveCreds } = await muzammil_connectSession(false, sessionId);
        sessionState.sock = muzammil_sock;
        sessionState.isConnecting = true;

        muzammil_sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                sessionState.qr = qr;
                sessionState.isConnected = false;
                sessionState.lastQRTime = Date.now();
                console.log(`📱 QR generated for session: ${sessionId}`);

                if (qrTimeouts.has(sessionId)) {
                    clearTimeout(qrTimeouts.get(sessionId));
                }

                const timeout = setTimeout(() => {
                    console.log(`⏰ QR code expired for session: ${sessionId}, regenerating...`);
                    if (!sessionState.isConnected && sessionState.sock) {
                        sessionState.sock.end(undefined);
                        setTimeout(() => {
                            startSession(sessionId);
                        }, 1000);
                    }
                }, 120000);

                qrTimeouts.set(sessionId, timeout);
            }

            if (connection === 'close') {
                sessionState.isConnected = false;
                sessionState.isConnecting = false;
                sessionState.lastConnectionTime = Date.now();

                if (keepAliveIntervals.has(sessionId)) {
                    clearInterval(keepAliveIntervals.get(sessionId));
                    keepAliveIntervals.delete(sessionId);
                }

                if (qrTimeouts.has(sessionId)) {
                    clearTimeout(qrTimeouts.get(sessionId));
                    qrTimeouts.delete(sessionId);
                }

                const statusCode = (lastDisconnect?.error instanceof Boom) ?
                    lastDisconnect.error.output.statusCode : 500;

                const isLoggedOut = statusCode === DisconnectReason.loggedOut ||
                                   statusCode === 440 ||
                                   lastDisconnect?.error?.message?.includes('401');

                if (isLoggedOut) {
                    console.log(`❌ Session ${sessionId} logged out. Removing session.`);
                    sessions.delete(sessionId);
                    await muzammil_clearSession(sessionId);
                    return;
                }

                const delay = Math.min(3000 * Math.pow(1.5, sessionState.reconnectAttempts), 30000);
                sessionState.reconnectAttempts += 1;

                console.log(`Session ${sessionId}: Connection closed, reconnecting in ${delay}ms (attempt ${sessionState.reconnectAttempts})`);

                setTimeout(() => {
                    if (!sessions.has(sessionId) || !sessions.get(sessionId).isConnected) {
                        startSession(sessionId);
                    }
                }, delay);

            } else if (connection === 'open') {
                sessionState.isConnected = true;
                sessionState.isConnecting = false;
                sessionState.qr = null;
                sessionState.reconnectAttempts = 0;
                sessionState.lastConnectionTime = Date.now();

                if (qrTimeouts.has(sessionId)) {
                    clearTimeout(qrTimeouts.get(sessionId));
                    qrTimeouts.delete(sessionId);
                }

                console.log(`✅ ${sessionId}: Connected to WhatsApp`);

                startKeepAlive(sessionId, muzammil_sock);

                try {
                    await muzammil_sock.sendPresenceAvailable();
                } catch (e) {
                    // Ignore presence errors
                }
            }
        });

        muzammil_sock.ev.on('creds.update', saveCreds);

        // Utility command handler only (!ping / !jid / !gjid). No forwarding,
        // no auto-relay — this bot's only job now is sending FSR reports.
        muzammil_sock.ev.on('messages.upsert', async muzammil_m => {
            const muzammil_msg = muzammil_m.messages[0];
            if (!muzammil_msg.message) return;

            let muzammil_unwrapped = muzammil_msg.message;
            while (muzammil_unwrapped && (
                muzammil_unwrapped.ephemeralMessage ||
                muzammil_unwrapped.viewOnceMessage ||
                muzammil_unwrapped.viewOnceMessageV2 ||
                muzammil_unwrapped.viewOnceMessageV2Extension
            )) {
                muzammil_unwrapped = muzammil_unwrapped.ephemeralMessage?.message
                    || muzammil_unwrapped.viewOnceMessage?.message
                    || muzammil_unwrapped.viewOnceMessageV2?.message
                    || muzammil_unwrapped.viewOnceMessageV2Extension?.message;
            }
            if (muzammil_unwrapped) muzammil_msg.message = muzammil_unwrapped;

            const muzammil_text = muzammil_msg.message.conversation ||
                muzammil_msg.message.extendedTextMessage?.text ||
                muzammil_msg.message.imageMessage?.caption ||
                muzammil_msg.message.videoMessage?.caption ||
                muzammil_msg.message.documentMessage?.caption || "";

            if (muzammil_text.startsWith('!')) {
                await processCommand(muzammil_sock, muzammil_msg);
            }
        });

        muzammil_sock.ev.on('error', (error) => {
            console.error(`Socket error for session ${sessionId}:`, error);
        });

    } catch (error) {
        console.error(`Failed to start session ${sessionId}:`, error);
        setTimeout(() => {
            if (!sessions.has(sessionId) || !sessions.get(sessionId).isConnected) {
                startSession(sessionId);
            }
        }, 5000);
    }
}

function getDefaultSessionId() {
    return config.sessionId || 'muzammil_session';
}

// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

// API: GET STATUS
muzammil_app.get('/api/status', requireAuth, async (req, res) => {
    const sessionId = req.query.sessionId || getDefaultSessionId();
    const session = sessions.get(sessionId);

    let qrDataUrl = null;
    let connected = false;
    const dbConnected = muzammil_isDbConnected() && mongoose.connection.readyState === 1;

    if (session) {
        connected = session.isConnected;
        if (session.qr) {
            try {
                qrDataUrl = await QRCode.toDataURL(session.qr, { width: 256 });
            } catch (e) { }
        }
    }

    const isConnecting = session?.isConnecting || false;
    const hasKeepAlive = keepAliveIntervals.has(sessionId);

    res.json({
        sessionId,
        connected,
        isConnecting,
        qr: qrDataUrl,
        qrAvailable: !!session?.qr,
        dbConnected,
        dbConfigured: !!config.mongoDbUrl,
        phoneNumber: connected ? 'Connected ✅' : (isConnecting ? 'Connecting...' : 'Disconnected'),
        lastActive: new Date().toISOString(),
        keepAliveActive: hasKeepAlive,
        botStartTime: BOT_START_TIME,
        uptimeSeconds: Math.floor((Date.now() - BOT_START_TIME) / 1000),
        activeSessions: Array.from(sessions.keys()).map(id => ({
            id,
            connected: sessions.get(id)?.isConnected || false,
            hasQR: !!sessions.get(id)?.qr,
            keepAlive: keepAliveIntervals.has(id)
        }))
    });
});

// API: GENERATE NEW QR
muzammil_app.post('/api/generate-qr', requireAuth, async (req, res) => {
    try {
        const sessionId = req.query.sessionId || getDefaultSessionId();
        const session = sessions.get(sessionId);

        if (keepAliveIntervals.has(sessionId)) {
            clearInterval(keepAliveIntervals.get(sessionId));
            keepAliveIntervals.delete(sessionId);
        }

        if (session && session.sock) {
            session.sock.end(undefined);
            setTimeout(() => {
                startSession(sessionId);
            }, 1000);
            res.json({ success: true, message: 'Generating new QR code...' });
        } else {
            startSession(sessionId);
            res.json({ success: true, message: 'Starting session with new QR...' });
        }
    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: RESTART BOT
muzammil_app.post('/api/restart', requireAuth, async (req, res) => {
    try {
        console.log('🔄 Restarting bot...');

        for (const [sessionId, interval] of keepAliveIntervals) {
            clearInterval(interval);
        }
        keepAliveIntervals.clear();

        for (const [sessionId, timeout] of qrTimeouts) {
            clearTimeout(timeout);
        }
        qrTimeouts.clear();

        for (const [sessionId, session] of sessions) {
            if (session.sock) {
                try {
                    session.sock.end(undefined);
                } catch (e) {
                    console.error(`Error ending session ${sessionId}:`, e);
                }
            }
        }
        sessions.clear();

        setTimeout(() => {
            main().catch(err => console.error('Restart error:', err));
        }, 1000);

        res.json({ success: true, message: 'Bot restarting...' });
    } catch (error) {
        console.error('Restart error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: LOGOUT
muzammil_app.post('/api/logout', requireAuth, async (req, res) => {
    try {
        const sessionId = req.query.sessionId || getDefaultSessionId();
        const session = sessions.get(sessionId);

        if (keepAliveIntervals.has(sessionId)) {
            clearInterval(keepAliveIntervals.get(sessionId));
            keepAliveIntervals.delete(sessionId);
        }

        if (qrTimeouts.has(sessionId)) {
            clearTimeout(qrTimeouts.get(sessionId));
            qrTimeouts.delete(sessionId);
        }

        if (session && session.sock) {
            try {
                await session.sock.logout();
            } catch (e) {
                console.error('Logout error:', e);
            }
            sessions.delete(sessionId);
            await muzammil_clearSession(sessionId);
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: GET SESSIONS LIST
muzammil_app.get('/api/sessions', requireAuth, async (req, res) => {
    try {
        const sessionList = Array.from(sessions.keys()).map(id => ({
            sessionId: id,
            isConnected: sessions.get(id)?.isConnected || false,
            hasQR: !!sessions.get(id)?.qr,
            isConnecting: sessions.get(id)?.isConnecting || false,
            keepAliveActive: keepAliveIntervals.has(id)
        }));

        res.json({
            success: true,
            sessions: sessionList,
            total: sessionList.length,
            activeKeepAlives: keepAliveIntervals.size
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: HEALTH CHECK
muzammil_app.get('/api/health', async (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        sessions: sessions.size,
        qrTimeouts: qrTimeouts.size,
        keepAliveCount: keepAliveIntervals.size
    });
});

// -----------------------------------------------------------------------------
// AUTH ROUTES (dashboard login system - separate from the WhatsApp session)
// -----------------------------------------------------------------------------

muzammil_app.get('/api/auth/status', async (req, res) => {
    const count = await muzammil_countDashUsers();
    res.json({ success: true, setupDone: count > 0 });
});

muzammil_app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password || password.length < 4) {
            return res.status(400).json({ success: false, error: 'Username and a password (4+ chars) are required' });
        }
        const existingCount = await muzammil_countDashUsers();
        if (existingCount > 0) {
            return res.status(403).json({ success: false, error: 'Setup already completed. Please log in.' });
        }
        const passwordHash = await hashPassword(password);
        const user = await muzammil_createDashUser(username.trim(), passwordHash);
        const token = signToken({ username: user.username });
        setAuthCookie(res, token);
        await refreshFsrConfigCache(user.username);
        res.json({ success: true, username: user.username });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ success: false, error: error.message || 'Signup failed' });
    }
});

muzammil_app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password are required' });
        }
        const user = await muzammil_getDashUserByUsername(username.trim());
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid username or password' });
        }
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({ success: false, error: 'Invalid username or password' });
        }
        const token = signToken({ username: user.username });
        setAuthCookie(res, token);
        await refreshFsrConfigCache(user.username);
        res.json({ success: true, username: user.username });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message || 'Login failed' });
    }
});

muzammil_app.post('/api/auth/logout', requireAuth, (req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
});

muzammil_app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ success: true, username: req.user.username });
});

// -----------------------------------------------------------------------------
// FSR ROUTES
// -----------------------------------------------------------------------------

// Which WhatsApp group the FSR reports get sent to.
muzammil_app.get('/api/fsr/config', requireAuth, async (req, res) => {
    try {
        const cfg = await muzammil_getFsrConfig(req.user.username);
        if (!cfg) return res.status(503).json({ success: false, error: 'Database not connected' });
        res.json({ success: true, config: { groupJid: cfg.groupJid || '' }, companyName: config.companyName });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

muzammil_app.post('/api/fsr/config', requireAuth, async (req, res) => {
    try {
        const { groupJid } = req.body || {};
        const updates = {};
        if (typeof groupJid === 'string') updates.groupJid = groupJid.trim();

        const ok = await muzammil_saveFsrConfig(req.user.username, updates);
        if (!ok) return res.status(503).json({ success: false, error: 'Database not connected' });

        await refreshFsrConfigCache(req.user.username);
        res.json({ success: true });
    } catch (error) {
        console.error('Save FSR config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Submit a completed FSR — builds the report and sends it straight to the
// configured WhatsApp group.
muzammil_app.post('/api/fsr/submit', requireAuth, async (req, res) => {
    try {
        const payload = req.body || {};
        const validationError = validateFsrPayload(payload);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const groupJid = getFsrGroupJid();
        if (!groupJid) {
            return res.status(400).json({ success: false, error: 'No WhatsApp group configured yet. Set the FSR group JID under Account first.' });
        }

        const sessionId = getDefaultSessionId();
        const session = sessions.get(sessionId);
        if (!session || !session.isConnected || !session.sock) {
            return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Link it under Connect first.' });
        }

        const message = buildFsrMessage({
            name: String(payload.name).trim(),
            region: String(payload.region).trim(),
            siteId: String(payload.siteId).trim().toUpperCase(),
            date: String(payload.date).trim(),
            engineOil: payload.engineOil,
            oilFilter: payload.oilFilter,
            fuelFilter: payload.fuelFilter,
            airFilter: payload.airFilter,
            coolant: payload.coolant,
            silicon: payload.silicon,
            cottonWaste: payload.cottonWaste,
            pvcTape: payload.pvcTape,
            cableTie: payload.cableTie,
            manualItems: payload.manualItems,
            serviceItems: payload.serviceItems
        });

        await session.sock.sendMessage(groupJid, { text: message });

        res.json({ success: true, message: 'FSR submitted successfully', preview: message });
    } catch (error) {
        console.error('FSR submit error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to submit FSR' });
    }
});


function muzammil_startServer() {
    muzammil_app.listen(muzammil_port, () => {
        console.log(`🌐 Server running on port ${muzammil_port}`);
        console.log(`📋 FSR mode: reports send to group ${getFsrGroupJid() || '(not configured yet)'}`);
        console.log(`🤖 Bot Commands: !ping, !jid, !gjid`);
        console.log(`🔄 Keep-Alive: Active (prevents 50-min timeout)`);
        console.log(`\n📌 API Endpoints:`);
        console.log(`   GET  /api/status      - Get bot status`);
        console.log(`   POST /api/generate-qr - Generate new QR code`);
        console.log(`   POST /api/restart     - Restart bot`);
        console.log(`   POST /api/logout      - Logout bot`);
        console.log(`   GET  /api/sessions    - List all sessions`);
        console.log(`   GET  /api/health      - Health check`);
        console.log(`   POST /api/fsr/submit  - Submit an FSR report`);
    });
}

// -----------------------------------------------------------------------------
// MAIN STARTUP
// -----------------------------------------------------------------------------
async function main() {
    if (config.mongoDbUrl) {
        const dbResult = await muzammil_connectDatabase(config.mongoDbUrl);
        if (dbResult) {
            console.log('✅ Database connected');

            const admin = await muzammil_getFirstDashUser();
            if (admin) {
                await refreshFsrConfigCache(admin.username);
            }
        }
    }

    const sessionId = getDefaultSessionId();
    await startSession(sessionId);

    muzammil_startServer();
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    for (const [sessionId, interval] of keepAliveIntervals) {
        clearInterval(interval);
    }
    for (const [sessionId, timeout] of qrTimeouts) {
        clearTimeout(timeout);
    }
    for (const [sessionId, session] of sessions) {
        if (session.sock) {
            try {
                await session.sock.end(undefined);
            } catch (e) {}
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down...');
    for (const [sessionId, interval] of keepAliveIntervals) {
        clearInterval(interval);
    }
    for (const [sessionId, timeout] of qrTimeouts) {
        clearTimeout(timeout);
    }
    for (const [sessionId, session] of sessions) {
        if (session.sock) {
            try {
                await session.sock.end(undefined);
            } catch (e) {}
        }
    }
    process.exit(0);
});

main();
