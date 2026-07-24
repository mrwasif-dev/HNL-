const jwt = require('jsonwebtoken');
const config = require('./muzammil');

const COOKIE_NAME = 'hnl_fsr_token';
const TOKEN_TTL = '30d';

// ERP-ID based login: no per-user accounts, no signup. Anyone whose ERP ID
// is in the ERP_IDS allow-list (set in Heroku Config Vars / .env) and who
// enters the shared ERP_PASSWORD is let in.
function verifyErpCredentials(erpId, password) {
    if (!erpId || !password) return false;
    const id = String(erpId).trim();
    if (!config.erpIds.includes(id)) return false;
    return password === config.erpPassword;
}

function signToken(payload) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, config.jwtSecret);
    } catch (e) {
        return null;
    }
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME);
}

// Express middleware - requires a valid session cookie
function requireAuth(req, res, next) {
    const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!token) {
        return res.status(401).json({ success: false, error: 'Not logged in' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: 'Session expired, please log in again' });
    }
    req.user = decoded; // { erpId }
    next();
}

module.exports = {
    COOKIE_NAME,
    verifyErpCredentials,
    signToken,
    verifyToken,
    setAuthCookie,
    clearAuthCookie,
    requireAuth
};
