/**
 * DatabaseAgent — Module 6: Collaborative Agentic AI
 *
 * Receives the domain plan from the Planner, designs a relational schema
 * (tables, fields, relationships), generates SQL, and publishes the schema
 * contract so BackendAgent and FrontendAgent can build on it.
 */

const aiService = require('../services/ai');
const { DATABASE_SYSTEM_PROMPT } = require('./prompts/database');

class DatabaseAgent {
  get name() { return 'database'; }

  /**
   * @param {SharedContext} ctx
   * @param {MessageBus}    bus
   * @param {string}        model
   * @param {function}      emit
   */
  async run(ctx, bus, model, emit) {
    const task = ctx.tasks.find(t => t.agentName === 'database');
    if (!task) {
      console.warn('[DatabaseAgent] No database task found in context');
      return;
    }

    ctx.startTask(task.id);
    emit({
      type: 'agent_start',
      agent: 'database',
      message: `Database Agent designing schema for "${ctx.domain}"...`
    });
    bus.broadcast('database', 'agent:started', { agent: 'database' });

    const userMessage = `Domain: ${ctx.domain}
Domain type: ${ctx.domainType}
Features needed: ${ctx.features.join(', ')}
Task: ${task.description}

Design a complete relational database schema with seed data for this domain.`;

    let dbResult;
    try {
      const raw = await aiService._complete([
        { role: 'system', content: DATABASE_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ], model);

      dbResult = aiService._extractJson(raw);

      if (dbResult.error || !dbResult.schema || !dbResult.schema.tables) {
        throw new Error('Database agent returned invalid schema: ' + (dbResult.error || 'missing schema.tables'));
      }
    } catch (err) {
      console.warn('[DatabaseAgent] LLM parse failed, using domain-aware fallback:', err.message);
      dbResult = this._buildFallbackSchema(ctx.domain, ctx.domainType);
    }

    // Store in shared context
    ctx.updateSchema(dbResult.schema, dbResult.sqlCode || '');
    ctx.seedData = dbResult.seedData || {};

    ctx.completeTask(task.id, `Schema with ${dbResult.schema.tables.length} tables`);

    // Publish the schema contract — BackendAgent and FrontendAgent are subscribed
    bus.broadcast('database', 'schema:updated', {
      schema: dbResult.schema,
      seedData: dbResult.seedData,
      tableCount: dbResult.schema.tables.length
    });

    emit({
      type: 'agent_done',
      agent: 'database',
      result: {
        tables: dbResult.schema.tables.map(t => ({
          name: t.name,
          fieldCount: t.fields.length,
          fields: t.fields.map(f => f.name)
        })),
        seedData: ctx.seedData
      }
    });

    console.log(`[DatabaseAgent] Schema created: ${dbResult.schema.tables.map(t => t.name).join(', ')}`);
    return dbResult;
  }

  /** Domain-aware fallback schema when LLM fails. */
  _buildFallbackSchema(domain, domainType) {
    const lp = (domain || '').toLowerCase();

    // Student Management
    if (domainType === 'management' || /student|school|college/.test(lp)) {
      return {
        schema: {
          tables: [
            {
              name: 'courses',
              fields: [
                { name: 'id',         type: 'INTEGER', primaryKey: true, autoIncrement: true },
                { name: 'title',      type: 'TEXT',    required: true },
                { name: 'instructor', type: 'TEXT' },
                { name: 'credits',    type: 'INTEGER' }
              ]
            },
            {
              name: 'students',
              fields: [
                { name: 'id',          type: 'INTEGER', primaryKey: true, autoIncrement: true },
                { name: 'name',        type: 'TEXT',    required: true },
                { name: 'email',       type: 'TEXT',    unique: true },
                { name: 'course_id',   type: 'INTEGER', foreignKey: 'courses.id' },
                { name: 'grade',       type: 'TEXT' },
                { name: 'enrolled_at', type: 'DATETIME' }
              ]
            }
          ]
        },
        seedData: {
          courses: [
            { id: 1, title: 'Mathematics 101', instructor: 'Dr. Smith',  credits: 3 },
            { id: 2, title: 'Computer Science', instructor: 'Prof. Kumar', credits: 4 },
            { id: 3, title: 'Physics',          instructor: 'Dr. Patel',  credits: 3 },
            { id: 4, title: 'English Literature', instructor: 'Ms. Jones', credits: 2 }
          ],
          students: [
            { id: 1, name: 'Alice Johnson', email: 'alice@school.edu',   course_id: 1, grade: 'A'  },
            { id: 2, name: 'Bob Smith',     email: 'bob@school.edu',     course_id: 2, grade: 'B+' },
            { id: 3, name: 'Carol Davis',   email: 'carol@school.edu',   course_id: 1, grade: 'A-' },
            { id: 4, name: 'David Wilson',  email: 'david@school.edu',   course_id: 3, grade: 'B'  },
            { id: 5, name: 'Emma Brown',    email: 'emma@school.edu',    course_id: 2, grade: 'A'  },
            { id: 6, name: 'Frank Miller',  email: 'frank@school.edu',   course_id: 4, grade: 'C+' },
            { id: 7, name: 'Grace Lee',     email: 'grace@school.edu',   course_id: 3, grade: 'B+' }
          ]
        },
        sqlCode: `CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  instructor TEXT,
  credits INTEGER
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  course_id INTEGER REFERENCES courses(id),
  grade TEXT,
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`
      };
    }

    // E-commerce fallback
    if (domainType === 'ecommerce' || /shop|store|product/.test(lp)) {
      return {
        schema: {
          tables: [
            {
              name: 'products',
              fields: [
                { name: 'id',       type: 'INTEGER', primaryKey: true, autoIncrement: true },
                { name: 'name',     type: 'TEXT',    required: true },
                { name: 'price',    type: 'REAL',    required: true },
                { name: 'stock',    type: 'INTEGER' },
                { name: 'category', type: 'TEXT' }
              ]
            }
          ]
        },
        seedData: {
          products: [
            { id: 1, name: 'Laptop Pro', price: 999.99, stock: 15, category: 'Electronics' },
            { id: 2, name: 'Wireless Mouse', price: 29.99, stock: 50, category: 'Accessories' },
            { id: 3, name: 'USB Hub', price: 19.99, stock: 30, category: 'Accessories' },
            { id: 4, name: 'Monitor 27"', price: 349.99, stock: 8, category: 'Electronics' },
            { id: 5, name: 'Mechanical Keyboard', price: 89.99, stock: 20, category: 'Accessories' }
          ]
        },
        sqlCode: `CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER DEFAULT 0,
  category TEXT
);`
      };
    }

    // Generic fallback
    return {
      schema: {
        tables: [
          {
            name: 'items',
            fields: [
              { name: 'id',          type: 'INTEGER', primaryKey: true, autoIncrement: true },
              { name: 'title',       type: 'TEXT',    required: true },
              { name: 'description', type: 'TEXT' },
              { name: 'status',      type: 'TEXT' },
              { name: 'created_at',  type: 'DATETIME' }
            ]
          }
        ]
      },
      seedData: {
        items: [
          { id: 1, title: 'Item One',   description: 'First sample item',  status: 'active' },
          { id: 2, title: 'Item Two',   description: 'Second sample item', status: 'active' },
          { id: 3, title: 'Item Three', description: 'Third sample item',  status: 'pending' }
        ]
      },
      sqlCode: `CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`
    };
  }
}

module.exports = new DatabaseAgent();

