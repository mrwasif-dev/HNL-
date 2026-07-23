const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../muzammil');

const COOKIE_NAME = 'muzammil_token';
const TOKEN_TTL = '30d';

function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
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
    req.user = decoded; // { username }
    next();
}

module.exports = {
    COOKIE_NAME,
    hashPassword,
    verifyPassword,
    signToken,
    verifyToken,
    setAuthCookie,
    clearAuthCookie,
    requireAuth
};
