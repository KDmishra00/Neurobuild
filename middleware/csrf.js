/**
 * CSRF protection via double-submit token pattern.
 *
 * Flow:
 *  1. Client fetches GET /api/auth/csrf-token
 *  2. Client sends the token back in the X-CSRF-Token header on
 *     state-changing unauthenticated requests (register, login, etc.)
 *
 * Bearer-token authenticated routes are exempt — browsers do not
 * automatically attach Authorization headers, so CSRF is not applicable.
 */

const crypto = require('crypto');

const CSRF_TTL_MS = 60 * 60 * 1000; // 1 hour
const csrfTokens = new Map();
const CSRF_SECRET = process.env.JWT_SECRET || 'neurobuild-csrf-default-secret-fallback';

function issueCsrfToken() {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}.${nonce}`;
  const sig = crypto.createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');
  const token = `${payload}.${sig}`;
  csrfTokens.set(token, timestamp + CSRF_TTL_MS);
  return token;
}

function validateCsrfToken(token) {
  if (!token || typeof token !== 'string') return false;

  // 1. Check in-memory store if present (for single-instance / local tests)
  if (csrfTokens.has(token)) {
    const expiresAt = csrfTokens.get(token);
    csrfTokens.delete(token);
    if (expiresAt > Date.now()) return true;
  }

  // 2. Stateless HMAC verification (crucial for multi-instance / serverless cold starts)
  const parts = token.split('.');
  if (parts.length === 3) {
    const [timestampStr, nonce, sig] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;
    const now = Date.now();
    // Valid within TTL (and allow 60s clock skew)
    if (now - timestamp > CSRF_TTL_MS || now < timestamp - 60000) {
      return false;
    }
    const expectedSig = crypto.createHmac('sha256', CSRF_SECRET).update(`${timestampStr}.${nonce}`).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
    } catch {
      return false;
    }
  }

  return false;
}

// Sweep expired tokens every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of csrfTokens) {
    if (expiresAt <= now) csrfTokens.delete(token);
  }
}, 15 * 60 * 1000).unref();

/**
 * Middleware that validates the X-CSRF-Token header.
 * Skip if the request carries a Bearer token (already CSRF-safe).
 */
function csrfProtection(req, res, next) {
  const authHeader = req.header('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) return next();

  const token = req.header('X-CSRF-Token');
  if (!validateCsrfToken(token)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Fetch /api/auth/csrf-token first.' });
  }
  next();
}

module.exports = { issueCsrfToken, validateCsrfToken, csrfProtection };
