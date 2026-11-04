/**
 * SharedContext — Module 6: Collaborative Agentic AI
 *
 * A shared state object that every agent in the multi-agent system
 * can read from and write to. Acts as the single source of truth for
 * the current run: original prompt, domain analysis, database schema,
 * API contract, generated HTML, task list, and agent message log.
 *
 * The JSON contract format lets any agent understand what others produced
 * without tight coupling between agent implementations.
 */

class SharedContext {
  /**
   * @param {string} originalPrompt  — The user's original website prompt
   * @param {string} baseHtml        — The AI-generated base HTML to enhance
   */
  constructor(originalPrompt = '', baseHtml = '') {
    // ── Inputs ────────────────────────────────────────────────────────────
    this.originalPrompt = originalPrompt;
    this.baseHtml = baseHtml;

    // ── Domain Analysis (set by Planner) ──────────────────────────────────
    this.domain = '';          // e.g. "Student Management System"
    this.domainType = '';      // e.g. "management" | "ecommerce" | "blog" | "generic"
    this.needsBackend = false; // true when domain needs data persistence
    this.features = [];        // list of feature strings the site should have

    // ── Task List (created by Planner, updated by all agents) ─────────────
    this.tasks = [
      // { id, agentName, description, status: 'pending'|'running'|'done'|'failed', result }
    ];

    // ── Database Contract (set by DatabaseAgent) ──────────────────────────
    this.schema = {
      tables: []
      // e.g. [{ name: 'students', fields: ['id','name','email','course_id'], primaryKey: 'id' }]
    };
    this.seedData = {};   // { tableName: [ {rowObj}, ... ] }
    this.schemaCode = ''; // Raw SQL or migration code string

    // ── API Contract (set by BackendAgent) ────────────────────────────────
    this.apiContract = {
      endpoints: []
      // e.g. [{ method: 'GET', path: '/api/students', description: '...', responseShape: {} }]
    };
    this.backendCode = ''; // Express route code (shown in download bundle)

    // ── Frontend Output (set by FrontendAgent) ────────────────────────────
    this.enhancedHtml = ''; // Final enhanced HTML with CRUD + charts

    // ── Reviewer Notes (set by ReviewerAgent) ─────────────────────────────
    this.reviewIssues = []; // [{ targetAgent, severity, description }]
    this.reviewPassed = false;
    this.revisionCount = {}; // { agentName: numberOfRevisionsRequested }

    // ── Run Metadata ──────────────────────────────────────────────────────
    this.startedAt = new Date();
    this.runId = null; // set after DB save
  }

  // ── Task Management ────────────────────────────────────────────────────

  /** Create a new task and append it to the task list. */
  addTask(id, agentName, description) {
    this.tasks.push({ id, agentName, description, status: 'pending', result: null });
  }

  /** Mark a task as running. */
  startTask(id) {
    const task = this._getTask(id);
    if (task) task.status = 'running';
  }

  /** Mark a task as done and store its result. */
  completeTask(id, result = null) {
    const task = this._getTask(id);
    if (task) { task.status = 'done'; task.result = result; }
  }

  /** Mark a task as failed with an error message. */
  failTask(id, errorMsg) {
    const task = this._getTask(id);
    if (task) { task.status = 'failed'; task.result = errorMsg; }
  }

  _getTask(id) {
    return this.tasks.find(t => t.id === id) || null;
  }

  // ── Schema Update (triggers notification via MessageBus) ───────────────

  /** Replace the schema and trigger downstream updates. Called by DatabaseAgent. */
  updateSchema(schema, schemaCode = '') {
    this.schema = schema;
    this.schemaCode = schemaCode;
  }

  /** Replace the API contract. Called by BackendAgent. */
  updateApiContract(apiContract, backendCode = '') {
    this.apiContract = apiContract;
    this.backendCode = backendCode;
  }

  /** Replace the enhanced HTML. Called by FrontendAgent. */
  updateEnhancedHtml(html) {
    this.enhancedHtml = html;
  }

  // ── Revision Tracking ──────────────────────────────────────────────────

  /** Returns how many revisions have been requested for the given agent. */
  getRevisionCount(agentName) {
    return this.revisionCount[agentName] || 0;
  }

  /** Increment the revision counter for an agent. */
  incrementRevisionCount(agentName) {
    this.revisionCount[agentName] = (this.revisionCount[agentName] || 0) + 1;
  }

  // ── Serialisation ──────────────────────────────────────────────────────

  /** Snapshot of everything agents need to share — safe to log/save. */
  toJSON() {
    return {
      originalPrompt: this.originalPrompt,
      domain: this.domain,
      domainType: this.domainType,
      needsBackend: this.needsBackend,
      features: this.features,
      tasks: this.tasks,
      schema: this.schema,
      apiContract: this.apiContract,
      reviewIssues: this.reviewIssues,
      reviewPassed: this.reviewPassed,
      revisionCount: this.revisionCount,
      startedAt: this.startedAt,
      runId: this.runId
    };
  }
}

module.exports = SharedContext;

