/**
 * Input sanitization middleware.
 * Trims strings, enforces length limits, and strips dangerous patterns.
 */

// Strip potentially dangerous HTML attributes / JS event handlers from stored content
const DANGEROUS_ATTRS = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const SCRIPT_TAG = /<script[\s>][\s\S]*?<\/script>/gi;

/**
 * Sanitize a string value: trim whitespace and enforce a max length.
 */
function sanitizeString(value, maxLength = 2000) {
  if (typeof value !== 'string') return value;
  return value.trim().substring(0, maxLength);
}

/**
 * Strip inline JS event handlers from HTML for display-safe output.
 * This does NOT alter the stored HTML — call it only when rendering
 * user-contributed HTML in contexts outside the sandboxed iframe.
 */
function stripDangerousHtml(html) {
  if (typeof html !== 'string') return html;
  return html
    .replace(DANGEROUS_ATTRS, '')
    .replace(SCRIPT_TAG, '<!-- script removed -->');
}

/**
 * Express middleware that sanitizes common body fields in-place.
 */
function sanitizeBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object') return next();

  // Trim all string values at the top level
  for (const key of Object.keys(req.body)) {
    if (typeof req.body[key] === 'string') {
      req.body[key] = req.body[key].trim();
    }
  }

  next();
}

/**
 * Middleware that attaches a unique request ID for log correlation.
 */
let requestCounter = 0;
function requestId(req, _res, next) {
  requestCounter = (requestCounter + 1) % 1_000_000;
  req.requestId = `${Date.now().toString(36)}-${requestCounter.toString(36)}`;
  next();
}

module.exports = { sanitizeString, stripDangerousHtml, sanitizeBody, requestId };
