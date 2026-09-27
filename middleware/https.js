/**
 * Enforce HTTPS in production.
 * Relies on x-forwarded-proto when behind a reverse proxy (Docker, nginx, etc.).
 */

function enforceHttps(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  // Always let health checks through — cloud providers probe /api/health over
  // plain HTTP and a redirect would falsely mark the service unhealthy.
  if (req.path === '/api/health') return next();

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  if (proto !== 'https') {
    const host = req.headers.host || 'localhost';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  next();
}

module.exports = { enforceHttps };
