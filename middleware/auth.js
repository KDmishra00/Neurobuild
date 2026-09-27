const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'neurobuild-dev-secret-change-in-production';
const TOKEN_EXPIRY = '7d';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ---------------------------------------------------------------------------
// In-memory token blacklist (for server-side logout)
// Each entry maps token → expiry timestamp. A periodic sweep removes
// expired entries so the Map doesn't grow unbounded.
// In production this should be backed by Redis; the in-memory version is
// suitable for single-process dev / small deployments.
// ---------------------------------------------------------------------------
const tokenBlacklist = new Map();

function blacklistToken(token) {
  try {
    const decoded = jwt.decode(token);
    // Store until the token's natural expiry so we don't reject it forever
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : Date.now() + TOKEN_EXPIRY_MS;
    tokenBlacklist.set(token, expiresAt);
  } catch {
    // If we can't decode, blacklist with a conservative TTL
    tokenBlacklist.set(token, Date.now() + TOKEN_EXPIRY_MS);
  }
}

function isBlacklisted(token) {
  return tokenBlacklist.has(token);
}

// Sweep expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of tokenBlacklist) {
    if (expiresAt <= now) tokenBlacklist.delete(token);
  }
}, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Auth middleware — verifies JWT and attaches user to request
// ---------------------------------------------------------------------------
const auth = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database is not available. Start MongoDB and try again.' });
    }

    const authHeader = req.header('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Reject tokens that have been explicitly logged out
    if (isBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been revoked.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
};

const getTokenExpiry = () => {
  return new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();
};

module.exports = { auth, generateToken, getTokenExpiry, blacklistToken, isBlacklisted, tokenBlacklist, JWT_SECRET, TOKEN_EXPIRY_MS };
