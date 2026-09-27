/**
 * Unit tests for AIService utility methods only.
 * (AI generation methods require a live Ollama/cloud API and are tested via integration.)
 */

// We need to mock fetch before requiring the module
jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation(() => ({}))
}));

// Provide a minimal mock for global fetch so the module loads
global.fetch = jest.fn();

const aiService = require('../../../services/ai');

describe('AIService — Utilities', () => {
  describe('prompt normalization', () => {
    test('creates a compact, bounded website specification', () => {
      const specification = aiService.buildWebsiteSpecification('  Build\n\t a bakery website  ');
      expect(specification).toContain('Website request: Build a bakery website');
      expect(specification).toContain('mobile-first');
    });
  });

  describe('normalizeGeneratedSite', () => {
    test('separates structured HTML, CSS, and JavaScript into a safe site object', () => {
      const result = aiService.normalizeGeneratedSite(JSON.stringify({
        title: 'Demo <Site>',
        html: '<main onclick="alert(1)"><h1>Welcome</h1><a href="javascript:alert(1)">Bad link</a></main>',
        css: '@import url("https://example.com/style.css");\nmain { color: rebeccapurple; }',
        js: 'fetch("https://example.com"); window.parent.postMessage("x", "*");'
      }));

      expect(result.structured).toBe(true);
      expect(result.html).toContain('<h1>Welcome</h1>');
      expect(result.html).not.toContain('onclick');
      expect(result.html).not.toContain('javascript:');
      expect(result.css).not.toContain('@import');
      expect(result.js).toContain('undefined');
      expect(result.document).toContain('<style>');
      expect(result.document).toContain('<script>');
    });

    test('falls back to a legacy HTML response and removes external scripts', () => {
      const result = aiService.normalizeGeneratedSite(`<!DOCTYPE html>
        <html><head><title>Legacy site</title><style>body { margin: 0; }</style></head>
        <body><h1>Hello</h1><script src="https://example.com/app.js"></script><script>console.log('ok')</script></body></html>`);

      expect(result.structured).toBe(false);
      expect(result.title).toBe('Legacy site');
      expect(result.html).toContain('<h1>Hello</h1>');
      expect(result.js).toContain("console.log('ok')");
      expect(result.document).not.toContain('example.com/app.js');
    });

    test('rejects empty website content', () => {
      expect(() => aiService.normalizeGeneratedSite('{"title":"Empty","html":"","css":"","js":""}'))
        .toThrow('did not contain any page content');
    });

    test('re-adds calculator button handlers with valid HTML quoting', () => {
      const result = aiService.normalizeGeneratedSite(JSON.stringify({
        title: 'Calculator',
        html: '<div class="calc"><button>7</button><button>/</button><button>=</button></div>',
        css: '',
        js: 'function handleNumber(n){} function handleOperator(o){} function calculate(){}'
      }));

      // The re-added handler must be valid HTML — single quotes inside the
      // double-quoted attribute, never unescaped double quotes.
      expect(result.html).toContain('onclick="handleNumber(\'7\')"');
      // The final document must not contain the mangled tag form
      // (<button7")>7) that unescaped inner quotes used to produce.
      expect(result.document).not.toMatch(/<button[^>]*"\)/);
      expect(result.document).toContain('<button>7</button>');
    });

    test('button fallback wires to the model\'s own function naming (appendNumber/appendOperator)', () => {
      const modelJs = 'function appendNumber(n){} function appendOperator(o){} function calculate(){} function clearDisplay(){} function deleteLast(){}';
      const result = aiService.normalizeGeneratedSite(JSON.stringify({
        title: 'Calc',
        html: '<div><button>7</button><button>+</button><button>=</button></div>',
        css: '',
        js: modelJs
      }));

      // The injected wiring must call the functions the model actually
      // defined, not hardcoded handleNumber/handleOperator names.
      expect(result.js).toContain('appendNumber(t);');
      expect(result.js).toContain("appendOperator(t === '−' ? '-' : t);");
      expect(result.js).toContain('calculate();');
    });
  });

  describe('cleanHtml', () => {
    test('should strip markdown code fences', () => {
      const input = '```html\n<!DOCTYPE html><html></html>\n```';
      const result = aiService.cleanHtml(input);
      expect(result).toMatch(/^<!DOCTYPE html>/i);
      expect(result).not.toContain('```');
    });

    test('should add DOCTYPE if missing', () => {
      const result = aiService.cleanHtml('<html><body>Hi</body></html>');
      expect(result.toLowerCase()).toStartWith('<!doctype html>');
    });

    test('should not double DOCTYPE', () => {
      const result = aiService.cleanHtml('<!DOCTYPE html><html></html>');
      const count = (result.match(/<!doctype/gi) || []).length;
      expect(count).toBe(1);
    });
  });

  describe('cache', () => {
    test('should cache and retrieve', () => {
      aiService.setCached('test prompt', 'model-a', '<html>cached</html>');
      const cached = aiService.getCached('test prompt', 'model-a');
      expect(cached).toBe('<html>cached</html>');
    });

    test('should return null for non-existent cache', () => {
      const cached = aiService.getCached('nonexistent', 'model-x');
      expect(cached).toBeNull();
    });

    test('should be case-insensitive on prompt', () => {
      aiService.setCached('Hello World', 'model-b', '<html>hello</html>');
      const cached = aiService.getCached('hello world', 'model-b');
      expect(cached).toBe('<html>hello</html>');
    });
  });

  describe('isExternalCloudModel', () => {
    test('should identify external cloud models', () => {
      expect(aiService.isExternalCloudModel('openai/gpt-4o-mini:cloud')).toBe(true);
      expect(aiService.isExternalCloudModel('google/gemma-3-27b-it:cloud')).toBe(true);
    });

    test('should identify Astra and OpenAI models', () => {
      expect(aiService.isExternalCloudModel('openai/gpt-6-astra:cloud')).toBe(true);
      expect(aiService.isAstraModel('openai/gpt-6-astra:cloud')).toBe(true);
      expect(aiService.isOpenAIModel('openai/gpt-6-astra:cloud')).toBe(false);
      expect(aiService.isOpenAIModel('openai/gpt-4o:cloud')).toBe(true);
      expect(aiService.isOpenAIModel('openai/gpt-4o-mini:cloud')).toBe(true);
    });

    test('should not flag Ollama cloud models', () => {
      expect(aiService.isExternalCloudModel('kimi-k2.5:cloud')).toBe(false);
    });

    test('should not flag local models', () => {
      expect(aiService.isExternalCloudModel('qwen3:4b')).toBe(false);
      expect(aiService.isExternalCloudModel('gemma:latest')).toBe(false);
    });
  });

  describe('_parseChatReply', () => {
    test('should extract HTML from markers', () => {
      const reply = 'Here is your website:\n|||HTML_START|||<!DOCTYPE html><html><body>Test</body></html>|||HTML_END|||\nEnjoy!';
      const result = aiService._parseChatReply(reply);
      expect(result.html).toContain('<body>Test</body>');
      expect(result.reply).toContain('Enjoy!');
      expect(result.reply).not.toContain('HTML_START');
    });

    test('should detect full-HTML replies', () => {
      const reply = '<!DOCTYPE html><html><body>Full page</body></html>';
      const result = aiService._parseChatReply(reply);
      expect(result.html).toContain('Full page');
      expect(result.reply).toBeTruthy();
    });

    test('should handle text-only replies', () => {
      const reply = 'Sure, I can help you with CSS flexbox. Here are the basics...';
      const result = aiService._parseChatReply(reply);
      expect(result.html).toBe('');
      expect(result.reply).toBe(reply);
    });
  });

  describe('_extractJson', () => {
    test('should parse clean JSON', () => {
      const result = aiService._extractJson('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    test('should extract from code blocks', () => {
      const result = aiService._extractJson('Here is the result:\n```json\n{"score": 85}\n```\nDone.');
      expect(result).toEqual({ score: 85 });
    });

    test('should extract from mixed text', () => {
      const result = aiService._extractJson('Some text before {"a": 1} and after');
      expect(result).toEqual({ a: 1 });
    });

    test('should return error for unparseable text', () => {
      const result = aiService._extractJson('This is not JSON at all');
      expect(result.error).toBeDefined();
    });
  });
});

// Custom matcher
expect.extend({
  toStartWith(received, expected) {
    const pass = received.startsWith(expected);
    return {
      pass,
      message: () => `expected "${received.substring(0, 30)}..." to start with "${expected}"`
    };
  }
});
