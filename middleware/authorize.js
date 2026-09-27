/**
 * Role-based authorization middleware.
 *
 * Usage:
 *   const { requireRole } = require('../middleware/authorize');
 *   router.get('/admin/stats', auth, requireRole('admin'), handler);
 *   router.delete('/users/:id', auth, requireRole('admin', 'moderator'), handler);
 *
 * Must be used AFTER the `auth` middleware so that `req.user` is populated.
 */

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }

    next();
  };
}

module.exports = { requireRole };
