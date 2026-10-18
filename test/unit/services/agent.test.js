/**
 * Unit tests for Agentic AI Orchestrator (Module 6)
 */

jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation(() => ({}))
}));

global.fetch = jest.fn();

const agentOrchestrator = require('../../../services/agent');
const aiService = require('../../../services/ai');

describe('Agentic AI Orchestrator — Module 6', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Utility methods', () => {
    test('_truncate limits large HTML payloads to prevent token overflow', () => {
      const longHtml = '<div>' + 'A'.repeat(20000) + '</div>';
      const truncated = agentOrchestrator._truncate(longHtml, 1000);
      expect(truncated.length).toBeLessThan(longHtml.length);
      expect(truncated).toContain('<!-- truncated for analysis -->');
    });

    test('_truncate preserves short HTML without modification', () => {
      const shortHtml = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>';
      expect(agentOrchestrator._truncate(shortHtml, 1000)).toBe(shortHtml);
    });
  });

  describe('Agent loop execution', () => {
    test('successfully executes Planner ➔ Executor ➔ Evaluator loop when threshold is met', async () => {
      const sampleHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>`;
      const improvedHtml = `<!DOCTYPE html><html><head><title>Test</title><meta name="description" content="Test site"></head><body><h1>Hello</h1></body></html>`;

      const events = [];
      const onProgress = (event) => events.push(event);

      // Mock aiService._complete to simulate the 3 agents
      jest.spyOn(aiService, '_complete').mockImplementation(async (messages, model) => {
        const systemPrompt = messages[0]?.content || '';
        if (systemPrompt.includes('PLANNER')) {
          return JSON.stringify({
            currentScore: 70,
            actions: [
              { id: 1, category: 'seo', priority: 'high', title: 'Add meta description', instruction: 'Add meta tag' }
            ],
            summary: 'Adding essential SEO meta description'
          });
        } else if (systemPrompt.includes('EXECUTOR')) {
          return improvedHtml;
        } else if (systemPrompt.includes('EVALUATOR')) {
          return JSON.stringify({
            scores: { design: 90, accessibility: 88, performance: 92, seo: 90, responsive: 88 },
            overall: 90,
            passed: true,
            verdict: 'Excellent quality, ready for production',
            remainingIssues: []
          });
        }
        return '{}';
      });

      const result = await agentOrchestrator.optimize(sampleHtml, 'mock-model', onProgress);

      expect(result.iterations).toBe(1);
      expect(result.finalScore.overall).toBe(90);
      expect(result.finalScore.passed).toBe(true);
      expect(result.finalHtml).toBe(improvedHtml);
      expect(result.improved).toBe(true);

      // Check event progression
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('planner_start');
      expect(eventTypes).toContain('planner_done');
      expect(eventTypes).toContain('executor_start');
      expect(eventTypes).toContain('executor_done');
      expect(eventTypes).toContain('evaluator_start');
      expect(eventTypes).toContain('evaluator_done');
      expect(eventTypes).toContain('complete');
    });

    test('handles JSON parsing failure gracefully with fallback plan and evaluation', async () => {
      const sampleHtml = `<!DOCTYPE html><html><body><h1>Minimal</h1></body></html>`;

      jest.spyOn(aiService, '_complete').mockImplementation(async (messages) => {
        const systemPrompt = messages[0]?.content || '';
        if (systemPrompt.includes('PLANNER')) {
          return 'Not valid JSON from model';
        } else if (systemPrompt.includes('EXECUTOR')) {
          return `<!DOCTYPE html><html><body><h1>Minimal Rev 1</h1></body></html>`;
        } else if (systemPrompt.includes('EVALUATOR')) {
          return 'Invalid JSON score';
        }
        return '';
      });

      const result = await agentOrchestrator.optimize(sampleHtml, 'mock-model');

      expect(result.iterations).toBeGreaterThanOrEqual(1);
      expect(result.finalScore).toBeDefined();
      expect(typeof result.finalScore.overall).toBe('number');
    });
  });
});
