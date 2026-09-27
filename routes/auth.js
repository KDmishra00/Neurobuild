const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { generateToken, getTokenExpiry, blacklistToken } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validate');
const { requireDb } = require('../middleware/db');
const { csrfProtection } = require('../middleware/csrf');
const Project = require('../models/Project');
const Conversation = require('../models/Conversation');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

router.use(requireDb);

function formatUserResponse(user) {
  return {
    id: user._id,
    username: user.username,
    name: user.name,
    email: user.email,
    settings: user.settings,
    generationCount: user.generationCount
  };
}

function authSuccessResponse(user) {
  return {
    token: generateToken(user._id),
    expiresAt: getTokenExpiry(),
    user: formatUserResponse(user)
  };
}

// ---------------------------------------------------------------------------
// Auth-specific rate limiter — stricter than the global one to prevent
// brute-force attacks on login / register / forgot-password.
// 5 attempts per 15-minute window per IP. Only enforced in production so
// development and test environments aren't locked out during active work.
// ---------------------------------------------------------------------------
const authLimiter = process.env.NODE_ENV !== 'production'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many attempts. Please try again after 15 minutes.' }
    });

// Register — requires CSRF token (unauthenticated state-changing request)
router.post('/register', authLimiter, csrfProtection, validateRegister, async (req, res) => {
  try {
    const { username, name, email, password } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const user = new User({
      username: normalizedUsername,
      name: name.trim(),
      email: normalizedEmail,
      password
    });

    await user.save();

    res.status(201).json(authSuccessResponse(user));
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login — requires CSRF token (unauthenticated state-changing request)
router.post('/login', authLimiter, csrfProtection, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Track last login
    user.lastLoginAt = new Date();
    await user.save();

    res.json(authSuccessResponse(user));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').auth, async (req, res) => {
  try {
    res.json({
      authenticated: true,
      user: formatUserResponse(req.user)
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not load your account.' });
  }
});

// Update user settings
router.patch('/settings', require('../middleware/auth').auth, async (req, res) => {
  try {
    const allowedUpdates = ['darkMode', 'compact', 'autoPreview', 'emailUpdates', 'model'];
    allowedUpdates.forEach(key => {
      if (req.body[key] !== undefined) {
        req.user.settings[key] = req.body[key];
      }
    });

    await req.user.save();

    res.json({ settings: req.user.settings });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Update profile
router.patch('/profile', require('../middleware/auth').auth, async (req, res) => {
  try {
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      req.user.name = req.body.name.trim().substring(0, 50);
    } else {
      return res.status(400).json({ error: 'Name is required' });
    }

    await req.user.save();

    res.json({
      user: formatUserResponse(req.user)
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete account and every project it owns. This endpoint is intentionally
// explicit; signing out only removes the local session.
router.delete('/account', require('../middleware/auth').auth, async (req, res) => {
  try {
    await Project.deleteMany({ owner: req.user._id });
    await Conversation.deleteMany({ owner: req.user._id });
    await User.findByIdAndDelete(req.user._id);
    res.status(204).end();
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Change password
router.post('/change-password', require('../middleware/auth').auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    // Generate a new token so old sessions are effectively invalidated on next use
    res.json({
      message: 'Password changed successfully',
      token: generateToken(user._id),
      expiresAt: getTokenExpiry()
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot password (stub — logs token to console in dev, ready for email integration)
router.post('/forgot-password', authLimiter, csrfProtection, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      // Don't reveal whether the email exists
      return res.json({ message: 'If that email is registered, a reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // In development, log to console. In production, send an email.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
    }

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset' });
  }
});

// ---------------------------------------------------------------------------
// Reset password — consumes the token generated by POST /forgot-password
// ---------------------------------------------------------------------------
router.post('/reset-password', authLimiter, csrfProtection, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Hash the incoming token the same way we stored it
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() }
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    // Update password and clear reset fields
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    // Issue a fresh JWT so the user is logged in immediately
    res.json({
      message: 'Password has been reset successfully.',
      token: generateToken(user._id),
      expiresAt: getTokenExpiry()
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ---------------------------------------------------------------------------
// Refresh token — issues a fresh JWT for an already-authenticated user
// ---------------------------------------------------------------------------
router.post('/refresh', require('../middleware/auth').auth, async (req, res) => {
  try {
    const newToken = generateToken(req.user._id);
    res.json({ token: newToken, expiresAt: getTokenExpiry() });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token.' });
  }
});

// ---------------------------------------------------------------------------
// Logout — blacklists the current token server-side
// ---------------------------------------------------------------------------
router.post('/logout', require('../middleware/auth').auth, async (req, res) => {
  try {
    blacklistToken(req.token);
    res.status(204).end();
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout.' });
  }
});

module.exports = router;
