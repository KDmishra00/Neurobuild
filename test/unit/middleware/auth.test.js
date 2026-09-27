const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { auth, generateToken, blacklistToken } = require('../../../middleware/auth');
const User = require('../../../models/User');

jest.mock('jsonwebtoken');
jest.mock('../../../models/User');

describe('Auth Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      header: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
    
    // Reset to ready for most tests
    mongoose.connection.readyState = 1;
  });

  describe('generateToken', () => {
    it('should generate a valid JWT', () => {
      const mockId = 'user123';
      jwt.sign.mockReturnValue('mock-token');

      const token = generateToken(mockId);

      expect(jwt.sign).toHaveBeenCalledWith(
        { id: mockId },
        process.env.JWT_SECRET || 'neurobuild-dev-secret-change-in-production',
        { expiresIn: '7d' }
      );
      expect(token).toBe('mock-token');
    });
  });

  describe('auth middleware function', () => {
    it('should return 503 if database is not available', async () => {
      mongoose.connection.readyState = 0;
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database is not available. Start MongoDB and try again.' });
    });

    it('should return 401 if no Authorization header is provided', async () => {
      req.header.mockReturnValue(undefined);

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if header does not start with Bearer', async () => {
      req.header.mockReturnValue('Basic some-token');

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is blacklisted', async () => {
      req.header.mockReturnValue('Bearer blacklisted-token');
      jwt.verify.mockReturnValue({ id: 'user123' });
      
      // Blacklist the token
      blacklistToken('blacklisted-token');

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token has been revoked.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token verification fails', async () => {
      req.header.mockReturnValue('Bearer invalid-token');
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user is not found', async () => {
      req.header.mockReturnValue('Bearer valid-token');
      jwt.verify.mockReturnValue({ id: 'user123' });
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() and attach user to req if token is valid and user exists', async () => {
      req.header.mockReturnValue('Bearer valid-token');
      jwt.verify.mockReturnValue({ id: 'user123' });
      
      const mockUser = { _id: 'user123', name: 'Test User' };
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await auth(req, res, next);

      expect(jwt.verify).toHaveBeenCalled();
      expect(req.user).toBe(mockUser);
      expect(req.token).toBe('valid-token');
      expect(next).toHaveBeenCalled();
    });
  });
});
