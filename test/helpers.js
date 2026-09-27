const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Project = require('../models/Project');

const JWT_SECRET = process.env.JWT_SECRET || 'neurobuild-dev-secret-change-in-production';

/**
 * Create a test user and return the user document + JWT token.
 */
async function createTestUser(overrides = {}) {
  const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const userData = {
    username: `user_${uniqueId}`,
    name: 'Test User',
    email: `test-${uniqueId}@example.com`,
    password: 'password123',
    ...overrides
  };

  const user = new User(userData);
  await user.save();

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });

  return { user, token };
}

/**
 * Create a test project for a given user.
 */
async function createTestProject(ownerId, overrides = {}) {
  const projectData = {
    owner: ownerId,
    name: 'Test Project',
    prompt: 'A test website',
    html: '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Test</h1></body></html>',
    ...overrides
  };

  return await Project.create(projectData);
}

/**
 * Generate an auth header object for supertest requests.
 */
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { createTestUser, createTestProject, authHeader };
