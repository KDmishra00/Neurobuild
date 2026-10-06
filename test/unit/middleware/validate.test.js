const { validateRegister, validateLogin, validateGenerate } = require('../../../middleware/validate');

function mockReq(body) {
  return { body };
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; }
  };
  return res;
}

describe('Validate Middleware', () => {
  describe('validateRegister', () => {
    test('should pass with valid data', () => {
      const req = mockReq({ username: 'testuser', name: 'Test', email: 'test@test.com', password: '12345678' });
      const res = mockRes();
      const next = jest.fn();
      validateRegister(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should reject missing name', () => {
      const req = mockReq({ username: 'testuser', email: 'test@test.com', password: '12345678' });
      const res = mockRes();
      validateRegister(req, res, () => {});
      expect(res.statusCode).toBe(400);
    });

    test('should reject invalid email', () => {
      const req = mockReq({ username: 'testuser', name: 'Test', email: 'notanemail', password: '12345678' });
      const res = mockRes();
      validateRegister(req, res, () => {});
      expect(res.statusCode).toBe(400);
    });

    test('should reject short password', () => {
      const req = mockReq({ username: 'testuser', name: 'Test', email: 'test@test.com', password: '123' });
      const res = mockRes();
      validateRegister(req, res, () => {});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateLogin', () => {
    test('should pass with valid data', () => {
      const req = mockReq({ email: 'test@test.com', password: '12345678' });
      const res = mockRes();
      const next = jest.fn();
      validateLogin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should reject missing password', () => {
      const req = mockReq({ email: 'test@test.com' });
      const res = mockRes();
      validateLogin(req, res, () => {});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateGenerate', () => {
    test('should pass with valid prompt', () => {
      const req = mockReq({ prompt: 'Build me a landing page' });
      const res = mockRes();
      const next = jest.fn();
      validateGenerate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should reject empty prompt', () => {
      const req = mockReq({ prompt: '' });
      const res = mockRes();
      validateGenerate(req, res, () => {});
      expect(res.statusCode).toBe(400);
    });

    test('should accept prompts up to 100,000 characters', () => {
      const req = mockReq({ prompt: 'x'.repeat(100_000) });
      const res = mockRes();
      const next = jest.fn();
      validateGenerate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should reject oversized prompt', () => {
      const req = mockReq({ prompt: 'x'.repeat(100_001) });
      const res = mockRes();
      validateGenerate(req, res, () => {});
      expect(res.statusCode).toBe(400);
    });
  });
});
