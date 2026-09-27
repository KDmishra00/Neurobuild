const validator = require('validator');

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;

const validateRegister = (req, res, next) => {
  const { username, name, email, password } = req.body;
  const errors = [];

  if (!username || !username.trim()) {
    errors.push('Username is required');
  } else if (!USERNAME_RE.test(username.toLowerCase().trim())) {
    errors.push('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens');
  }

  if (!name || !name.trim()) {
    errors.push('Name is required');
  } else if (name.length > 50) {
    errors.push('Name cannot exceed 50 characters');
  }

  if (!email || !email.trim()) {
    errors.push('Email is required');
  } else if (!validator.isEmail(email)) {
    errors.push('Please enter a valid email');
  }

  if (!password) {
    errors.push('Password is required');
  } else if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || !email.trim()) {
    errors.push('Email is required');
  } else if (!validator.isEmail(email)) {
    errors.push('Please enter a valid email');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  next();
};

// Shared generation prompt budget. Measured in CHARACTERS, not words — an
// average English word is ~5 characters, so 10,000 chars ≈ 2,000 words.
// This comfortably fits long specs (e.g. pasted engine/system prompts) while
// staying well inside local model context windows (qwen3:14b supports 32k+).
const MAX_PROMPT_LENGTH = 10_000;

const validateGenerate = (req, res, next) => {
  const { prompt } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `Prompt cannot exceed ${MAX_PROMPT_LENGTH.toLocaleString()} characters (about 2,000 words)` });
  }

  next();
};

module.exports = { validateRegister, validateLogin, validateGenerate };
