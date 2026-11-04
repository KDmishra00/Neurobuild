/**
 * Unit tests for SharedContext — Module 6: Collaborative Agentic AI
 */

const SharedContext = require('../../../agents/sharedContext');
const MessageBus    = require('../../../agents/messageBus');

describe('SharedContext — Module 6 Shared Agent State', () => {
  let ctx;

  beforeEach(() => {
    ctx = new SharedContext('Student Management System', '<html><body><h1>Students</h1></body></html>');
  });

  test('initializes with original prompt, base HTML, and default empty contracts', () => {
    expect(ctx.originalPrompt).toBe('Student Management System');
    expect(ctx.baseHtml).toContain('<h1>Students</h1>');
    expect(ctx.tasks).toEqual([]);
    expect(ctx.schema.tables).toEqual([]);
    expect(ctx.apiContract.endpoints).toEqual([]);
    expect(ctx.enhancedHtml).toBe('');
    expect(ctx.reviewPassed).toBe(false);
  });

  test('manages task lifecycle (add, start, complete, fail)', () => {
    ctx.addTask('t1', 'database', 'Design database schema');
    expect(ctx.tasks.length).toBe(1);
    expect(ctx.tasks[0].status).toBe('pending');

    ctx.startTask('t1');
    expect(ctx.tasks[0].status).toBe('running');

    ctx.completeTask('t1', 'Created 3 tables');
    expect(ctx.tasks[0].status).toBe('done');
    expect(ctx.tasks[0].result).toBe('Created 3 tables');

    ctx.addTask('t2', 'backend', 'Generate Express routes');
    ctx.startTask('t2');
    ctx.failTask('t2', 'Syntax error');
    expect(ctx.tasks[1].status).toBe('failed');
    expect(ctx.tasks[1].result).toBe('Syntax error');
  });

  test('updates database schema and API contract with code snippets', () => {
    const schema = {
      tables: [
        {
          name: 'students',
          fields: [
            { name: 'id', primaryKey: true },
            { name: 'name', type: 'TEXT' }
          ]
        }
      ]
    };
    ctx.updateSchema(schema, 'CREATE TABLE students (id INT PRIMARY KEY, name TEXT);');
    expect(ctx.schema.tables.length).toBe(1);
    expect(ctx.schemaCode).toContain('CREATE TABLE');

    const apiContract = {
      endpoints: [
        { method: 'GET', path: '/api/students' }
      ]
    };
    ctx.updateApiContract(apiContract, 'router.get("/students", ...);');
    expect(ctx.apiContract.endpoints.length).toBe(1);
    expect(ctx.backendCode).toContain('router.get');
  });

  test('tracks revision counts per agent', () => {
    expect(ctx.getRevisionCount('frontend')).toBe(0);
    ctx.incrementRevisionCount('frontend');
    ctx.incrementRevisionCount('frontend');
    expect(ctx.getRevisionCount('frontend')).toBe(2);
    expect(ctx.getRevisionCount('backend')).toBe(0);
  });

  test('schema-change propagation: when schema adds a column, dependent contracts reflect it', () => {
    const bus = new MessageBus();

    // Setup listener: Backend Agent listens to schema:updated and updates API contract
    bus.subscribe('schema:updated', ({ schema }) => {
      const studentTable = schema.tables.find(t => t.name === 'students');
      const studentFields = studentTable.fields.map(f => f.name);

      // Backend derives contract from updated schema
      ctx.updateApiContract({
        endpoints: [
          {
            method: 'POST',
            path: '/api/students',
            bodyFields: studentFields
          }
        ]
      });

      // Backend notifies Frontend
      bus.publish('backend', 'frontend', 'api:updated', { bodyFields: studentFields });
    });

    // Setup listener: Frontend Agent listens to api:updated and updates form
    let renderedFormFields = [];
    bus.subscribe('api:updated', ({ bodyFields }) => {
      renderedFormFields = [...bodyFields];
    });

    // Step 1: Initial schema without "phone"
    const initialSchema = {
      tables: [
        { name: 'students', fields: [{ name: 'id' }, { name: 'name' }, { name: 'email' }] }
      ]
    };
    ctx.updateSchema(initialSchema);
    bus.publish('database', 'all', 'schema:updated', { schema: initialSchema });

    expect(renderedFormFields).toEqual(['id', 'name', 'email']);
    expect(ctx.apiContract.endpoints[0].bodyFields).toEqual(['id', 'name', 'email']);

    // Step 2: Database Agent adds a "phone" column
    const updatedSchema = {
      tables: [
        { name: 'students', fields: [{ name: 'id' }, { name: 'name' }, { name: 'email' }, { name: 'phone' }] }
      ]
    };
    ctx.updateSchema(updatedSchema);
    bus.publish('database', 'all', 'schema:updated', { schema: updatedSchema });

    // Step 3: Verified that change propagated through Backend to Frontend
    expect(renderedFormFields).toEqual(['id', 'name', 'email', 'phone']);
    expect(ctx.apiContract.endpoints[0].bodyFields).toEqual(['id', 'name', 'email', 'phone']);
  });

  test('serializes safely to JSON for persistence', () => {
    ctx.domain = 'Student Management System';
    ctx.domainType = 'management';
    ctx.needsBackend = true;
    ctx.features = ['CRUD', 'Attendance Chart'];
    ctx.addTask('t1', 'database', 'Schema');

    const json = ctx.toJSON();
    expect(json.domain).toBe('Student Management System');
    expect(json.needsBackend).toBe(true);
    expect(json.tasks.length).toBe(1);
    expect(json.features).toContain('CRUD');
    expect(json.startedAt).toBeDefined();
  });
});

