/**
 * CollaborativeOrchestrator — Module 6: Collaborative Agentic AI
 *
 * Manages the full multi-agent enhancement run:
 *   1. Planner   → creates dynamic task list
 *   2. Database  → designs schema, publishes contract
 *   3. Backend   → generates API routes, publishes contract
 *   4. Frontend  → builds enhanced HTML using both contracts
 *   5. Reviewer  → validates HTML, requests revisions if needed
 *
 * Agents communicate through a SharedContext (read/write state) and
 * a MessageBus (pub/sub events). The reviewer can trigger a frontend
 * revision loop, capped at MAX_REVISIONS to prevent infinite loops.
 */

const SharedContext = require('./sharedContext');
const MessageBus    = require('./messageBus');
const plannerAgent  = require('./plannerAgent');
const databaseAgent = require('./databaseAgent');
const backendAgent  = require('./backendAgent');
const frontendAgent = require('./frontendAgent');
const reviewerAgent = require('./reviewerAgent');

const MAX_REVISIONS = 2; // max frontend revision cycles before accepting result

class CollaborativeOrchestrator {
  /**
   * Run the full collaborative agent pipeline.
   *
   * @param {string}   originalPrompt  — user's original website prompt
   * @param {string}   baseHtml        — the base generated HTML to enhance
   * @param {string}   model           — LLM model to use for all agents
   * @param {function} onEvent         — SSE event callback (event) => void
   * @returns {object} — { enhancedHtml, ctx, bus, success }
   */
  async run(originalPrompt, baseHtml, model, onEvent = () => {}) {
    const ctx = new SharedContext(originalPrompt, baseHtml);
    const bus = new MessageBus();

    const emit = (event) => {
      try { onEvent(event); } catch {}
    };

    emit({ type: 'orchestrator_start', message: 'Collaborative Agentic AI system initializing...' });
    console.log('[Orchestrator] Starting collaborative run');

    try {
      // ── Step 1: Planner ───────────────────────────────────────────────────
      emit({ type: 'phase', phase: 'planner', message: 'Phase 1/5: Planner analyzing site...' });
      await plannerAgent.run(ctx, bus, model, emit);

      // ── Step 2: Database (only if backend is needed) ──────────────────────
      if (ctx.needsBackend) {
        emit({ type: 'phase', phase: 'database', message: 'Phase 2/5: Database Agent designing schema...' });
        await databaseAgent.run(ctx, bus, model, emit);

        // ── Step 3: Backend ───────────────────────────────────────────────
        emit({ type: 'phase', phase: 'backend', message: 'Phase 3/5: Backend Agent generating API routes...' });
        await backendAgent.run(ctx, bus, model, emit);
      } else {
        emit({ type: 'phase', phase: 'database', message: 'Phase 2/5: Skipping database (static site)' });
        emit({ type: 'phase', phase: 'backend', message: 'Phase 3/5: Skipping backend (static site)' });
      }

      // ── Step 4: Frontend ───────────────────────────────────────────────────
      emit({ type: 'phase', phase: 'frontend', message: 'Phase 4/5: Frontend Agent enhancing HTML...' });
      await frontendAgent.run(ctx, bus, model, emit);

      // ── Step 5: Reviewer + revision loop ──────────────────────────────────
      emit({ type: 'phase', phase: 'reviewer', message: 'Phase 5/5: Reviewer/QA Agent validating...' });
      let reviewResult = await reviewerAgent.run(ctx, bus, model, emit);

      let revisionsDone = 0;
      while (!reviewResult.passed && revisionsDone < MAX_REVISIONS) {
        revisionsDone++;
        const highIssues = reviewResult.issues.filter(i => i.severity === 'high');

        emit({
          type: 'revision',
          revisionNumber: revisionsDone,
          maxRevisions: MAX_REVISIONS,
          message: `Reviewer found ${highIssues.length} issue(s) — sending revision request to Frontend Agent (${revisionsDone}/${MAX_REVISIONS})...`,
          issues: highIssues
        });

        // Frontend agent re-runs with the reviewer's feedback
        await frontendAgent.run(ctx, bus, model, emit, highIssues);

        // Reviewer re-checks
        emit({ type: 'phase', phase: 'reviewer', message: `Re-review after revision ${revisionsDone}...` });
        reviewResult = await reviewerAgent.run(ctx, bus, model, emit);
      }

      if (!reviewResult.passed) {
        emit({
          type: 'revision_limit',
          message: `Max revisions (${MAX_REVISIONS}) reached. Accepting best result.`,
          remainingIssues: reviewResult.issues
        });
      }

      // ── Complete ──────────────────────────────────────────────────────────
      emit({
        type: 'orchestrator_done',
        message: `Enhancement complete! ${revisionsDone} revision(s) made.`,
        reviewPassed: ctx.reviewPassed,
        taskSummary: ctx.tasks.map(t => ({ id: t.id, agent: t.agentName, status: t.status }))
      });

      console.log(`[Orchestrator] Run complete. HTML=${ctx.enhancedHtml.length}b, revisions=${revisionsDone}`);

      return {
        enhancedHtml: ctx.enhancedHtml || baseHtml,
        ctx,
        bus,
        success: true,
        revisions: revisionsDone
      };

    } catch (err) {
      console.error('[Orchestrator] Fatal error:', err.message);
      emit({ type: 'error', message: err.message });

      return {
        enhancedHtml: ctx.enhancedHtml || baseHtml,
        ctx,
        bus,
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Run as a Server-Sent Events async generator.
   * Yields events as they happen so the frontend can display live progress.
   *
   * @param {string} originalPrompt
   * @param {string} baseHtml
   * @param {string} model
   * @yields {object} SSE event objects
   */
  async *streamRun(originalPrompt, baseHtml, model) {
    const events = [];
    let done = false;
    let result = null;

    // Run the pipeline and collect events
    const runPromise = this.run(originalPrompt, baseHtml, model, (event) => {
      events.push(event);
    }).then(r => { result = r; done = true; });

    // Yield events as they accumulate (poll every 50ms)
    let idx = 0;
    while (!done || idx < events.length) {
      while (idx < events.length) {
        yield events[idx++];
      }
      if (!done) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // Catch any run error
    await runPromise;

    // Final result event with the full output
    yield {
      type: 'result',
      enhancedHtml: result?.enhancedHtml || baseHtml,
      success: result?.success || false,
      error: result?.error || null,
      taskSummary: result?.ctx?.tasks || [],
      messageLog: result?.bus?.getLog() || [],
      schema: result?.ctx?.schema || {},
      apiContract: result?.ctx?.apiContract || {},
      backendCode: result?.ctx?.backendCode || '',
      schemaCode: result?.ctx?.schemaCode || '',
      seedData: result?.ctx?.seedData || {}
    };
  }
}

module.exports = new CollaborativeOrchestrator();

