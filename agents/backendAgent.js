/**
 * BackendAgent — Module 6: Collaborative Agentic AI
 *
 * Reads the database schema from SharedContext (published by DatabaseAgent),
 * generates Express.js CRUD routes, and publishes the API contract so the
 * FrontendAgent knows exactly which paths and field names to use.
 */

const aiService = require('../services/ai');
const { BACKEND_SYSTEM_PROMPT } = require('./prompts/backend');

class BackendAgent {
  get name() { return 'backend'; }

  /**
   * @param {SharedContext} ctx
   * @param {MessageBus}    bus
   * @param {string}        model
   * @param {function}      emit
   */
  async run(ctx, bus, model, emit) {
    const task = ctx.tasks.find(t => t.agentName === 'backend');
    if (!task) {
      console.warn('[BackendAgent] No backend task found');
      return;
    }

    ctx.startTask(task.id);
    emit({
      type: 'agent_start',
      agent: 'backend',
      message: `Backend Agent generating API routes for "${ctx.domain}"...`
    });
    bus.broadcast('backend', 'agent:started', { agent: 'backend' });

    const schemaJson = JSON.stringify(ctx.schema, null, 2);

    const userMessage = `Domain: ${ctx.domain}
Task: ${task.description}

Database schema (use these exact table and field names):
${schemaJson}

Generate Express.js CRUD routes and an API contract for this schema.`;

    let result;
    try {
      const raw = await aiService._complete([
        { role: 'system', content: BACKEND_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ], model);

      result = aiService._extractJson(raw);

      if (result.error || !result.apiContract || !result.apiContract.endpoints) {
        throw new Error('Backend agent returned invalid result: ' + (result.error || 'missing apiContract'));
      }
    } catch (err) {
      console.warn('[BackendAgent] LLM failed, using schema-aware fallback:', err.message);
      result = this._buildFallbackContract(ctx.schema, ctx.domain);
    }

    // Store in shared context
    ctx.updateApiContract(result.apiContract, result.expressCode || '');

    ctx.completeTask(task.id, `${result.apiContract.endpoints.length} API endpoints`);

    // Notify FrontendAgent and others
    bus.broadcast('backend', 'api:defined', {
      apiContract: result.apiContract,
      endpointCount: result.apiContract.endpoints.length
    });

    emit({
      type: 'agent_done',
      agent: 'backend',
      result: {
        endpoints: result.apiContract.endpoints.map(e => `${e.method} ${e.path}`)
      }
    });

    console.log(`[BackendAgent] API contract: ${result.apiContract.endpoints.map(e => `${e.method} ${e.path}`).join(', ')}`);
    return result;
  }

  /** Build a contract directly from the schema when LLM fails. */
  _buildFallbackContract(schema, domain) {
    const tables = schema?.tables || [];
    // Use the first non-lookup table (most likely the main entity)
    const mainTable = tables.find(t => !t.name.includes('course') && !t.name.includes('categor')) || tables[0];
    if (!mainTable) {
      return {
        apiContract: { basePath: '/api', endpoints: [] },
        expressCode: '// No schema available'
      };
    }

    const name  = mainTable.name;          // e.g. 'students'
    const singular = name.replace(/s$/, ''); // e.g. 'student'

    const editableFields = mainTable.fields
      .filter(f => !f.primaryKey && !f.autoIncrement)
      .map(f => f.name);

    const bodyShape = editableFields.reduce((acc, f) => {
      acc[f] = 'string';
      return acc;
    }, {});

    const endpoints = [
      {
        method: 'GET',
        path: `/api/${name}`,
        description: `List all ${name}`,
        responseShape: { [name]: [] }
      },
      {
        method: 'POST',
        path: `/api/${name}`,
        description: `Create a new ${singular}`,
        body: bodyShape,
        responseShape: { [singular]: {}, message: `${singular} created` }
      },
      {
        method: 'PUT',
        path: `/api/${name}/:id`,
        description: `Update a ${singular} by ID`,
        body: bodyShape,
        responseShape: { message: `${singular} updated` }
      },
      {
        method: 'DELETE',
        path: `/api/${name}/:id`,
        description: `Delete a ${singular} by ID`,
        responseShape: { message: `${singular} deleted` }
      }
    ];

    // Add GET endpoints for lookup tables
    for (const t of tables) {
      if (t.name !== name) {
        endpoints.push({
          method: 'GET',
          path: `/api/${t.name}`,
          description: `List all ${t.name}`,
          responseShape: { [t.name]: [] }
        });
      }
    }

    const fieldList = editableFields.map(f => `'${f}'`).join(', ');
    const placeholders = editableFields.map(() => '?').join(', ');
    const updateSet = editableFields.map(f => `${f}=?`).join(', ');
    const getValues = editableFields.map(f => `req.body.${f}`).join(', ');

    const expressCode = `const express = require('express');
const router = express.Router();
const db = require('./database');

// GET /api/${name}
router.get('/${name}', (req, res) => {
  const rows = db.prepare('SELECT * FROM ${name}').all();
  res.json({ ${name}: rows });
});

// POST /api/${name}
router.post('/${name}', (req, res) => {
  const { ${editableFields.join(', ')} } = req.body;
  const result = db.prepare('INSERT INTO ${name} (${editableFields.join(', ')}) VALUES (${placeholders})').run(${getValues});
  res.status(201).json({ ${singular}: { id: result.lastInsertRowid, ...req.body }, message: '${singular} created' });
});

// PUT /api/${name}/:id
router.put('/${name}/:id', (req, res) => {
  const { ${editableFields.join(', ')} } = req.body;
  db.prepare('UPDATE ${name} SET ${updateSet} WHERE id=?').run(${getValues}, req.params.id);
  res.json({ message: '${singular} updated' });
});

// DELETE /api/${name}/:id
router.delete('/${name}/:id', (req, res) => {
  db.prepare('DELETE FROM ${name} WHERE id=?').run(req.params.id);
  res.json({ message: '${singular} deleted' });
});

module.exports = router;`;

    return { apiContract: { basePath: '/api', endpoints }, expressCode };
  }
}

module.exports = new BackendAgent();

