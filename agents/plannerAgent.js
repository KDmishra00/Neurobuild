/**
 * PlannerAgent — Module 6: Collaborative Agentic AI
 *
 * Analyzes the generated website and the user's prompt, decides which
 * enhancements are needed, creates a dynamic task list, and assigns
 * tasks to the specialized agents.
 */

const aiService = require('../services/ai');
const { PLANNER_SYSTEM_PROMPT } = require('./prompts/planner');

const MAX_HTML_FOR_PLANNER = 8000;

class PlannerAgent {
  get name() { return 'planner'; }

  /**
   * Analyze the site and produce a plan.
   *
   * @param {SharedContext} ctx     — shared state object
   * @param {MessageBus}    bus     — message bus for inter-agent comms
   * @param {string}        model   — LLM model to use
   * @param {function}      emit    — SSE event emitter (event) => void
   */
  async run(ctx, bus, model, emit) {
    emit({ type: 'agent_start', agent: 'planner', message: 'Planner analyzing site and creating task plan...' });
    bus.broadcast('planner', 'agent:started', { agent: 'planner' });

    const truncatedHtml = ctx.baseHtml.length > MAX_HTML_FOR_PLANNER
      ? ctx.baseHtml.substring(0, MAX_HTML_FOR_PLANNER) + '\n<!-- truncated -->'
      : ctx.baseHtml;

    const userMessage = `Original prompt: "${ctx.originalPrompt}"

Base generated HTML (truncated):
${truncatedHtml}

Analyze this website and create a detailed enhancement plan.`;

    let plan;
    try {
      const raw = await aiService._complete([
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ], model);

      plan = aiService._extractJson(raw);

      if (plan.error || !plan.tasks || !Array.isArray(plan.tasks)) {
        throw new Error('Planner returned invalid JSON: ' + (plan.error || 'missing tasks array'));
      }
    } catch (err) {
      console.warn('[PlannerAgent] LLM parse failed, using domain-aware fallback:', err.message);
      plan = this._buildFallbackPlan(ctx.originalPrompt);
    }

    // Write plan results into shared context
    ctx.domain     = plan.domain     || ctx.originalPrompt;
    ctx.domainType = plan.domainType || 'management';
    ctx.needsBackend = plan.needsBackend !== false; // default true
    ctx.features   = plan.features   || [];

    // Register tasks
    for (const task of plan.tasks) {
      ctx.addTask(task.id, task.agentName, task.description);
    }

    // Publish plan to the bus so other agents can listen
    bus.broadcast('planner', 'plan:created', {
      domain: ctx.domain,
      domainType: ctx.domainType,
      needsBackend: ctx.needsBackend,
      features: ctx.features,
      taskCount: plan.tasks.length,
      summary: plan.summary
    });

    emit({
      type: 'agent_done',
      agent: 'planner',
      result: {
        domain: ctx.domain,
        needsBackend: ctx.needsBackend,
        taskCount: plan.tasks.length,
        tasks: ctx.tasks,
        summary: plan.summary
      }
    });

    console.log(`[PlannerAgent] Plan created: domain="${ctx.domain}", tasks=${ctx.tasks.length}, needsBackend=${ctx.needsBackend}`);
    return plan;
  }

  /** Fallback plan when the LLM returns malformed JSON. */
  _buildFallbackPlan(prompt) {
    const lp = (prompt || '').toLowerCase();
    const isManagement = /student|school|college|employee|staff|inventory|hospital|patient/.test(lp);
    const isEcommerce  = /shop|store|product|cart|order|ecommerce/.test(lp);
    const isBlog       = /blog|article|post|news/.test(lp);

    let domain = prompt || 'Web Application';
    let domainType = 'generic';
    let features = ['Improved layout', 'Better navigation', 'Modern design'];

    if (isManagement) {
      domainType = 'management';
      features = ['Data table with CRUD', 'Search & filter', 'Statistics chart', 'Add/edit/delete records'];
    } else if (isEcommerce) {
      domainType = 'ecommerce';
      features = ['Product listing', 'Cart functionality', 'Order management', 'Sales chart'];
    } else if (isBlog) {
      domainType = 'blog';
      features = ['Post listing', 'Post detail', 'Category filter', 'Comments'];
    }

    return {
      domain,
      domainType,
      needsBackend: isManagement || isEcommerce,
      features,
      tasks: [
        { id: 't1', agentName: 'database', description: `Design schema for ${domain}`, priority: 1 },
        { id: 't2', agentName: 'backend',  description: `Generate CRUD API routes for ${domain}`, priority: 2 },
        { id: 't3', agentName: 'frontend', description: `Enhance HTML with data table and chart for ${domain}`, priority: 3 },
        { id: 't4', agentName: 'reviewer', description: 'Validate contracts and HTML consistency', priority: 4 }
      ],
      summary: `Enhance ${domain} with database-backed CRUD and visualizations`
    };
  }
}

module.exports = new PlannerAgent();

