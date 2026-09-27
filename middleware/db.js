const mongoose = require('mongoose');

let isConnecting = false;

async function requireDb(req, res, next) {
  // If already connected, proceed immediately
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  // If in the process of connecting, wait for it
  if (mongoose.connection.readyState === 2 || isConnecting) {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout waiting for MongoDB')), 5000);
        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });
        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      if (mongoose.connection.readyState === 1) {
        return next();
      }
    } catch (err) {
      console.error('[DB] Wait for connection failed:', err.message);
    }
  }

  // If disconnected and MONGODB_URI is provided, attempt connection now
  if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
    try {
      isConnecting = true;
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false
      });
      isConnecting = false;
      if (mongoose.connection.readyState === 1) {
        return next();
      }
    } catch (err) {
      isConnecting = false;
      console.error('[DB] On-demand connect error:', err.message);
      return res.status(503).json({
        error: `Database connection failed: ${err.message}. If using MongoDB Atlas, ensure Network Access allows 0.0.0.0/0.`
      });
    }
  }

  return res.status(503).json({
    error: 'Database is not available. Start MongoDB (see README) and try again.'
  });
}

module.exports = { requireDb };
