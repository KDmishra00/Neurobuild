const mongoose = require('mongoose');

function requireDb(req, res, next) {
  if (mongoose.connection.readyState === 1) {
    return next();
  }
  return res.status(503).json({
    error: 'Database is not available. Start MongoDB (see README) and try again.'
  });
}

module.exports = { requireDb };
