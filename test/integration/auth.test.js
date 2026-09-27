require('../setup');
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const User = require('../../models/User');
const { createTestUser, authHeader } = require('../helpers');
const { issueCsrfToken } = require('../../middleware/csrf');

// Build a mini Express app with just the auth routes for testing
const app = express();
app.use(express.json());
app.use('/api/auth', require('../../routes/auth'));

describe('Auth Integration', () => {
  test('POST /api/auth/register — creates a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ username: 'newuser', name: 'New User', email: 'new@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.name).toBe('New User');
    expect(res.body.user.email).toBe('new@test.com');
  });

  test('POST /api/auth/register — rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ username: 'user_a', name: 'A', email: 'dupe@test.com', password: '12345678' });

    const res = await request(app)
      .post('/api/auth/register')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ username: 'user_b', name: 'B', email: 'dupe@test.com', password: '65432178' });

    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login — authenticates valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ username: 'loginuser', name: 'Login User', email: 'login@test.com', password: 'mypassword' });

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ email: 'login@test.com', password: 'mypassword' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com');
  });

  test('POST /api/auth/login — rejects wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ username: 'wronguser', name: 'User', email: 'wrong@test.com', password: 'correct123' });

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ email: 'wrong@test.com', password: 'incorrect' });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — returns authenticated user', async () => {
    const { token } = await createTestUser({ email: 'me@test.com' });

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.email).toBe('me@test.com');
  });

  test('GET /api/auth/me — rejects without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('PATCH /api/auth/settings — updates settings', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .patch('/api/auth/settings')
      .set(authHeader(token))
      .send({ darkMode: false, compact: true });

    expect(res.status).toBe(200);
    expect(res.body.settings.darkMode).toBe(false);
    expect(res.body.settings.compact).toBe(true);
  });

  test('POST /api/auth/change-password — changes password', async () => {
    const { token, user } = await createTestUser({ password: 'oldpass123' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(authHeader(token))
      .send({ currentPassword: 'oldpass123', newPassword: 'newpass456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verify new password works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ email: user.email, password: 'newpass456' });
    expect(loginRes.status).toBe(200);
  });

  test('DELETE /api/auth/account — deletes account', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .delete('/api/auth/account')
      .set(authHeader(token));

    expect(res.status).toBe(204);
  });

  test('POST /api/auth/forgot-password — sends reset link', async () => {
    await createTestUser({ email: 'forgot@test.com' });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ email: 'forgot@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/);
  });

  test('POST /api/auth/reset-password — resets password', async () => {
    const { user } = await createTestUser({ email: 'reset@test.com' });

    // Directly set a reset token in DB for testing
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 3600000)
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ token: resetToken, newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verify login works with new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-CSRF-Token', issueCsrfToken())
      .send({ email: 'reset@test.com', password: 'newpassword123' });
      
    expect(loginRes.status).toBe(200);
  });

  test('POST /api/auth/refresh — refreshes token', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.token).not.toBe(token);
  });

  test('POST /api/auth/logout — blacklists token', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/logout')
      .set(authHeader(token));

    expect(res.status).toBe(204);

    // Verify token is no longer accepted for protected routes
    const meRes = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));
      
    expect(meRes.status).toBe(401);
  });
});

