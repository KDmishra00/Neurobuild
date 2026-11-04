/**
 * Unit tests for Collaborative Orchestrator — Module 6: Collaborative Agentic AI
 */

jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation(() => ({}))
}));

global.fetch = jest.fn();

const orchestrator = require('../../../agents/orchestrator');
const aiService    = require('../../../services/ai');

describe('CollaborativeOrchestrator — Module 6 Multi-Agent Coordination', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('successfully executes full 5-agent pipeline for a data-backed domain', async () => {
    const prompt = 'Student Management System';
    const baseHtml = `<!DOCTYPE html><html><head><title>Students</title></head><body><h1>Welcome</h1></body></html>`;

    // Mock aiService._complete for all agents
    jest.spyOn(aiService, '_complete').mockImplementation(async (messages) => {
      const systemPrompt = messages[0]?.content || '';

      if (systemPrompt.includes('PLANNER')) {
        return JSON.stringify({
          domain: 'Student Management System',
          domainType: 'management',
          needsBackend: true,
          features: ['Student CRUD', 'Course list', 'Attendance Chart'],
          tasks: [
            { id: 't1', agentName: 'database', description: 'Design tables', priority: 1 },
            { id: 't2', agentName: 'backend',  description: 'Create API routes', priority: 2 },
            { id: 't3', agentName: 'frontend', description: 'Render UI & Chart', priority: 3 },
            { id: 't4', agentName: 'reviewer', description: 'Audit consistency', priority: 4 }
          ],
          summary: 'Enhance Student Management with dynamic CRUD'
        });
      }

      if (systemPrompt.includes('DATABASE AGENT')) {
        return JSON.stringify({
          schema: {
            tables: [
              {
                name: 'students',
                fields: [
                  { name: 'id', primaryKey: true },
                  { name: 'name', type: 'TEXT', required: true },
                  { name: 'email', type: 'TEXT', required: true }
                ]
              }
            ]
          },
          seedData: {
            students: [
              { id: 1, name: 'Alice', email: 'alice@test.edu' },
              { id: 2, name: 'Bob', email: 'bob@test.edu' }
            ]
          },
          sqlCode: 'CREATE TABLE students (id INT PRIMARY KEY, name TEXT, email TEXT);'
        });
      }

      if (systemPrompt.includes('BACKEND AGENT')) {
        return JSON.stringify({
          apiContract: {
            basePath: '/api',
            endpoints: [
              { method: 'GET', path: '/api/students', description: 'List students' },
              { method: 'POST', path: '/api/students', description: 'Create student' }
            ]
          },
          expressCode: 'router.get("/students", (req, res) => res.json({ students: [] }));'
        });
      }

      if (systemPrompt.includes('FRONTEND/VISUALIZATION')) {
        return `<!DOCTYPE html><html><head><title>Students</title></head><body>
          <canvas id="dataChart"></canvas>
          <table><tr><th>Name</th><th>Email</th></tr><tr><td>Alice</td><td>alice@test.edu</td></tr></table>
          <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
          <script>function deleteRecord(id) {}</script>
        </body></html>`;
      }

      if (systemPrompt.includes('REVIEWER/QA')) {
        return JSON.stringify({
          passed: true,
          issues: [],
          summary: 'All contracts and UI elements verified successfully'
        });
      }

      return '{}';
    });

    const events = [];
    const onEvent = (e) => events.push(e);

    const result = await orchestrator.run(prompt, baseHtml, 'mock-model', onEvent);

    expect(result.success).toBe(true);
    expect(result.enhancedHtml).toContain('dataChart');
    expect(result.revisions).toBe(0);

    // Verify all 4 tasks are completed
    expect(result.ctx.tasks.length).toBe(4);
    result.ctx.tasks.forEach(t => expect(t.status).toBe('done'));

    // Verify contracts were populated
    expect(result.ctx.schema.tables.length).toBe(1);
    expect(result.ctx.apiContract.endpoints.length).toBe(2);

    // Verify MessageBus recorded the collaboration
    const busLog = result.bus.getLog();
    expect(busLog.length).toBeGreaterThan(3);

    // Verify event progression
    const eventTypes = events.map(e => e.type);
    expect(eventTypes).toContain('orchestrator_start');
    expect(eventTypes).toContain('phase');
    expect(eventTypes).toContain('agent_start');
    expect(eventTypes).toContain('agent_done');
    expect(eventTypes).toContain('orchestrator_done');
  });

  test('triggers revision loop when Reviewer detects high-severity issue', async () => {
    let frontendCallCount = 0;
    let reviewerCallCount = 0;

    jest.spyOn(aiService, '_complete').mockImplementation(async (messages) => {
      const systemPrompt = messages[0]?.content || '';

      if (systemPrompt.includes('PLANNER')) {
        return JSON.stringify({
          domain: 'Student System',
          domainType: 'management',
          needsBackend: true,
          features: ['CRUD'],
          tasks: [
            { id: 't1', agentName: 'database', description: 'DB' },
            { id: 't2', agentName: 'backend', description: 'API' },
            { id: 't3', agentName: 'frontend', description: 'UI' },
            { id: 't4', agentName: 'reviewer', description: 'QA' }
          ]
        });
      }
      if (systemPrompt.includes('DATABASE AGENT')) {
        return JSON.stringify({
          schema: { tables: [{ name: 'students', fields: [{ name: 'id' }, { name: 'email', required: true }] }] },
          seedData: { students: [] }
        });
      }
      if (systemPrompt.includes('BACKEND AGENT')) {
        return JSON.stringify({
          apiContract: { endpoints: [{ method: 'GET', path: '/api/students' }] },
          expressCode: ''
        });
      }
      if (systemPrompt.includes('FRONTEND/VISUALIZATION')) {
        frontendCallCount++;
        // First run misses the required 'email' field and chart
        if (frontendCallCount === 1) {
          return `<!DOCTYPE html><html><body><h1>No email field here</h1></body></html>`;
        }
        // Second run fixes it
        return `<!DOCTYPE html><html><body><input name="email" /><canvas id="dataChart"></canvas><script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script><script>function deleteRecord() {}</script></body></html>`;
      }
      if (systemPrompt.includes('REVIEWER/QA')) {
        reviewerCallCount++;
        if (reviewerCallCount === 1) {
          return JSON.stringify({
            passed: false,
            issues: [
              { targetAgent: 'frontend', severity: 'high', description: 'Missing email field', suggestedFix: 'Add email input' }
            ],
            summary: 'Missing required field'
          });
        }
        return JSON.stringify({
          passed: true,
          issues: [],
          summary: 'Revision fixed all issues'
        });
      }

      return '{}';
    });

    const events = [];
    const result = await orchestrator.run('Student System', '<html><body></body></html>', 'mock', (e) => events.push(e));

    expect(result.success).toBe(true);
    expect(frontendCallCount).toBe(2); // Initial run + 1 revision
    expect(result.revisions).toBe(1);

    const revisionEvents = events.filter(e => e.type === 'revision');
    expect(revisionEvents.length).toBe(1);
    expect(revisionEvents[0].revisionNumber).toBe(1);
  });

  test('skips database and backend agents when Planner detects static domain', async () => {
    let databaseCalled = false;
    let backendCalled = false;

    jest.spyOn(aiService, '_complete').mockImplementation(async (messages) => {
      const systemPrompt = messages[0]?.content || '';

      if (systemPrompt.includes('PLANNER')) {
        return JSON.stringify({
          domain: 'Portfolio Photography Site',
          domainType: 'portfolio',
          needsBackend: false, // STATIC SITE
          features: ['Gallery', 'Contact Form'],
          tasks: [
            { id: 't1', agentName: 'frontend', description: 'Enhance visual styling' },
            { id: 't2', agentName: 'reviewer', description: 'Check layout' }
          ]
        });
      }
      if (systemPrompt.includes('DATABASE AGENT')) {
        databaseCalled = true;
        return '{}';
      }
      if (systemPrompt.includes('BACKEND AGENT')) {
        backendCalled = true;
        return '{}';
      }
      if (systemPrompt.includes('FRONTEND/VISUALIZATION')) {
        return `<!DOCTYPE html><html><body><h1>Photo Portfolio</h1><canvas id="dataChart"></canvas><script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script><script>function deleteRecord() {}</script></body></html>`;
      }
      if (systemPrompt.includes('REVIEWER/QA')) {
        return JSON.stringify({ passed: true, issues: [], summary: 'Looks great' });
      }

      return '{}';
    });

    const result = await orchestrator.run('Portfolio', '<html><body>Static</body></html>', 'mock');

    expect(result.success).toBe(true);
    expect(databaseCalled).toBe(false);
    expect(backendCalled).toBe(false);
    expect(result.ctx.needsBackend).toBe(false);
  });
});

