/**
 * ReviewerAgent — Module 6: Collaborative Agentic AI
 *
 * Validates the enhanced HTML against the schema and API contracts.
 * If high-severity issues are found, it publishes revision requests
 * back to the FrontendAgent (via the MessageBus) and the orchestrator
 * triggers a re-run (capped at MAX_REVISIONS).
 */

const aiService = require('../services/ai');
const { REVIEWER_SYSTEM_PROMPT } = require('./prompts/reviewer');

class ReviewerAgent {
  get name() { return 'reviewer'; }

  /**
   * @param {SharedContext} ctx
   * @param {MessageBus}    bus
   * @param {string}        model
   * @param {function}      emit
   * @returns {{ passed: boolean, issues: Array }}
   */
  async run(ctx, bus, model, emit) {
    const task = ctx.tasks.find(t => t.agentName === 'reviewer');
    if (!task) {
      console.warn('[ReviewerAgent] No reviewer task found');
      return { passed: true, issues: [] };
    }

    ctx.startTask(task.id);
    emit({
      type: 'agent_start',
      agent: 'reviewer',
      message: 'Reviewer/QA Agent validating contracts and HTML consistency...'
    });
    bus.broadcast('reviewer', 'agent:started', { agent: 'reviewer' });

    const html = ctx.enhancedHtml || '';
    const schemaJson = JSON.stringify(ctx.schema, null, 2);
    const apiJson = JSON.stringify(ctx.apiContract, null, 2);

    // Quick structural checks before calling LLM (saves tokens)
    const quickIssues = this._quickCheck(html, ctx.schema, ctx.apiContract);

    let reviewResult;
    try {
      const userMessage = `Enhanced HTML to review:
${html.length > 10000 ? html.substring(0, 10000) + '\n<!-- truncated -->' : html}

DATABASE SCHEMA CONTRACT:
${schemaJson}

API CONTRACT:
${apiJson}

Validate the HTML against these contracts and report any mismatches.`;

      const raw = await aiService._complete([
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ], model);

      reviewResult = aiService._extractJson(raw);

      if (reviewResult.error || typeof reviewResult.passed !== 'boolean') {
        throw new Error('Reviewer returned invalid result');
      }
    } catch (err) {
      console.warn('[ReviewerAgent] LLM failed, using quick-check results:', err.message);
      reviewResult = {
        passed: quickIssues.length === 0,
        issues: quickIssues,
        summary: quickIssues.length === 0
          ? 'Quick structural checks passed'
          : `${quickIssues.length} issue(s) detected via structural analysis`
      };
    }

    // Merge quick-check issues that the LLM might have missed
    const llmIssueDescs = new Set((reviewResult.issues || []).map(i => i.description));
    for (const qi of quickIssues) {
      if (!llmIssueDescs.has(qi.description)) {
        reviewResult.issues = reviewResult.issues || [];
        reviewResult.issues.push(qi);
      }
    }

    // A run passes only if no high-severity issues remain
    const highSeverityCount = (reviewResult.issues || []).filter(i => i.severity === 'high').length;
    reviewResult.passed = highSeverityCount === 0;

    // Store results in context
    ctx.reviewIssues  = reviewResult.issues || [];
    ctx.reviewPassed  = reviewResult.passed;

    ctx.completeTask(task.id, `Review ${reviewResult.passed ? 'PASSED' : 'FAILED'} — ${(reviewResult.issues || []).length} issues`);

    if (!reviewResult.passed) {
      const highIssues = reviewResult.issues.filter(i => i.severity === 'high');
      bus.publish('reviewer', 'frontend', 'review:revision_needed', {
        issues: highIssues,
        summary: reviewResult.summary
      });
      emit({
        type: 'agent_message',
        from: 'reviewer',
        to: 'frontend',
        topic: 'review:revision_needed',
        message: `Found ${highIssues.length} high-severity issue(s). Requesting frontend revision.`,
        issues: highIssues
      });
    } else {
      bus.broadcast('reviewer', 'review:passed', { summary: reviewResult.summary });
    }

    emit({
      type: 'agent_done',
      agent: 'reviewer',
      result: {
        passed: reviewResult.passed,
        issueCount: (reviewResult.issues || []).length,
        issues: reviewResult.issues || [],
        summary: reviewResult.summary
      }
    });

    console.log(`[ReviewerAgent] Review ${reviewResult.passed ? 'PASSED' : 'FAILED'}: ${reviewResult.summary}`);
    return reviewResult;
  }

  /**
   * Fast structural checks that don't need an LLM.
   * Catches common mistakes before spending tokens on the full review.
   */
  _quickCheck(html, schema, apiContract) {
    const issues = [];

    if (!html || html.length < 200) {
      issues.push({ targetAgent: 'frontend', severity: 'high', description: 'Enhanced HTML is empty or too short', suggestedFix: 'Re-generate the full HTML' });
      return issues;
    }

    // Check chart canvas
    if (!html.includes('id="dataChart"') && !html.includes("id='dataChart'")) {
      issues.push({ targetAgent: 'frontend', severity: 'medium', description: 'Chart.js canvas with id="dataChart" is missing', suggestedFix: 'Add <canvas id="dataChart"></canvas> and initialize Chart.js' });
    }

    // Check Chart.js CDN
    if (!html.includes('chart.js') && !html.includes('Chart.js')) {
      issues.push({ targetAgent: 'frontend', severity: 'medium', description: 'Chart.js CDN script tag is missing', suggestedFix: 'Add <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>' });
    }

    // Check main table field names appear in HTML
    const mainTable = schema?.tables?.[0];
    if (mainTable) {
      const editableFields = mainTable.fields.filter(f => !f.primaryKey && !f.autoIncrement);
      for (const field of editableFields) {
        if (field.required && !html.includes(field.name)) {
          issues.push({
            targetAgent: 'frontend',
            severity: 'high',
            field: field.name,
            description: `Required field "${field.name}" from schema is not referenced in the HTML`,
            suggestedFix: `Add an input or table column for the field "${field.name}"`
          });
        }
      }
    }

    // Check delete function exists
    if (!html.includes('delete') && !html.includes('Delete')) {
      issues.push({ targetAgent: 'frontend', severity: 'medium', description: 'Delete functionality appears to be missing', suggestedFix: 'Add a deleteRecord() function and delete buttons in the table' });
    }

    return issues;
  }
}

module.exports = new ReviewerAgent();

