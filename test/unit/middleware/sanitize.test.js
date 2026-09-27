const { sanitizeString, stripDangerousHtml, sanitizeBody, requestId } = require('../../../middleware/sanitize');

describe('Sanitize Middleware', () => {
  describe('sanitizeString', () => {
    test('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    test('should enforce max length', () => {
      expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
    });

    test('should return non-strings as-is', () => {
      expect(sanitizeString(42)).toBe(42);
      expect(sanitizeString(null)).toBe(null);
    });
  });

  describe('stripDangerousHtml', () => {
    test('should remove script tags', () => {
      const result = stripDangerousHtml('<div>OK</div><script>alert(1)</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('<div>OK</div>');
    });

    test('should remove inline event handlers', () => {
      const result = stripDangerousHtml('<img onerror="alert(1)" src="x">');
      expect(result).not.toContain('onerror');
    });
  });

  describe('sanitizeBody', () => {
    test('should trim string body values', () => {
      const req = { body: { name: '  test  ', email: ' a@b.com ' } };
      const next = jest.fn();
      sanitizeBody(req, {}, next);
      expect(req.body.name).toBe('test');
      expect(req.body.email).toBe('a@b.com');
      expect(next).toHaveBeenCalled();
    });

    test('should handle missing body', () => {
      const req = {};
      const next = jest.fn();
      sanitizeBody(req, {}, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requestId', () => {
    test('should attach a requestId to the request', () => {
      const req = {};
      const next = jest.fn();
      requestId(req, {}, next);
      expect(req.requestId).toBeDefined();
      expect(typeof req.requestId).toBe('string');
      expect(next).toHaveBeenCalled();
    });
  });
});
