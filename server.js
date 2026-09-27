require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { sanitizeBody, requestId } = require('./middleware/sanitize');
const { enforceHttps } = require('./middleware/https');
const { issueCsrfToken } = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[Security Warning] JWT_SECRET is not set in production. Using fallback secret.');
}

// Security middleware
app.use(enforceHttps);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

// Request ID for log correlation
app.use(requestId);

// CORS - restrict to specific origins in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
    : true,
  credentials: true
};
app.use(cors(corsOptions));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize request bodies
app.use(sanitizeBody);

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Database connection
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    bufferCommands: false
  })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err.message));
} else {
  console.log('MONGODB_URI not set, running without database persistence');
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/generate'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/analytics', require('./routes/analytics'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    requestId: req.requestId
  });
});

// CSRF token endpoint — double-submit pattern for unauthenticated requests
app.get('/api/auth/csrf-token', (req, res) => {
  const csrfToken = issueCsrfToken();
  res.json({ csrfToken });
});

// Serve frontend — prefer the built React app (client/dist), otherwise
// fall back to the legacy static frontend/ directory.
const reactDist = path.join(__dirname, 'client', 'dist');
const frontendDir = path.join(__dirname, 'frontend');
const webRoot = require('fs').existsSync(path.join(reactDist, 'index.html'))
  ? reactDist
  : frontendDir;
const indexFile = path.join(webRoot, 'index.html');

app.use(express.static(webRoot));
app.use(express.static(frontendDir));
app.use(express.static(path.join(__dirname, 'public')));

// Serve the SPA at root and support client-side routing
app.get('/', (req, res) => {
  res.sendFile(indexFile);
});

// SPA fallback — any non-API GET or HEAD that isn't a static asset returns index.html
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api/')) {
    return res.sendFile(indexFile);
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  console.error(`[${req.requestId || '-'}] Error ${statusCode}:`, err.message || err);
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    requestId: req.requestId
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// When running as a long-lived server (Render, Railway, AWS EC2, Docker),
// start listening. On Vercel (serverless) we skip listen and just export
// the app for the platform's handler.
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      mongoose.connection.close(false).then(() => {
        console.log('MongoDB connection closed.');
        process.exit(0);
      }).catch(() => {
        process.exit(1);
      });
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
