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

function issueCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(token, Date.now() + CSRF_TTL_MS);
  return token;
}

function validateCsrfToken(token) {
  if (!token) return false;
  const expiresAt = csrfTokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    csrfTokens.delete(token);
    return false;
  }
  // Single-use: consume the token after validation
  csrfTokens.delete(token);
  return true;
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
