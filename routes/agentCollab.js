/**
 * agentCollab routes — Module 6: Collaborative Agentic AI
 *
 * POST /api/agent/collab/enhance
 *   Start a new collaborative agent run (SSE streaming)
 *
 * GET  /api/agent/collab/runs
 *   List the authenticated user's past runs
 *
 * GET  /api/agent/collab/runs/:runId
 *   Get a specific run with full details
 */

const express      = require('express');
const router       = express.Router();
const rateLimit    = require('express-rate-limit');
const { auth }     = require('../middleware/auth');
const { requireDb }= require('../middleware/db');
const orchestrator = require('../agents/orchestrator');
const AgentRun     = require('../models/AgentRun');

// All routes require authentication and a DB connection
router.use(auth, requireDb);

// Stricter rate limit for the agent endpoint (it's expensive)
const agentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: process.env.NODE_ENV !== 'production' ? 50 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enhancement requests. Please wait 5 minutes.' }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/collab/enhance
// Starts a collaborative agent run with live SSE streaming.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/enhance', agentLimiter, async (req, res) => {
  const { html, prompt, model, projectId } = req.body;

  if (!html || String(html).trim().length < 50) {
    return res.status(400).json({ error: 'Valid HTML is required (minimum 50 characters)' });
  }
  if (String(html).length > 2_000_000) {
    return res.status(400).json({ error: 'HTML is too large (max 2MB)' });
  }

  const originalPrompt = String(prompt || '').trim().slice(0, 10_000);
  const modelToUse = model || process.env.GROQ_API_KEY
    ? 'groq/openai/gpt-oss-120b:cloud'
    : (process.env.OLLAMA_MODEL || 'qwen3:14b');

  // Create a pending DB record so we can track the run
  let agentRun;
  try {
    agentRun = await AgentRun.create({
      owner: req.user._id,
      projectId: projectId || null,
      originalPrompt,
      baseHtml: html,
      status: 'running'
    });
  } catch (dbErr) {
    console.warn('[AgentCollab] Could not create AgentRun record:', dbErr.message);
    // Continue without persistence if DB fails
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send the runId immediately so the frontend can poll for history
  if (agentRun) {
    res.write(`data: ${JSON.stringify({ type: 'run_created', runId: agentRun._id })}\n\n`);
  }

  const startTime = Date.now();

  try {
    for await (const event of orchestrator.streamRun(originalPrompt, html, modelToUse)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Persist final result
      if (event.type === 'result' && agentRun) {
        try {
          await AgentRun.findByIdAndUpdate(agentRun._id, {
            enhancedHtml: event.enhancedHtml || html,
            status:       event.success ? 'complete' : 'failed',
            error:        event.error || '',
            messageLog:   (event.messageLog || []).slice(0, 200), // cap stored messages
            dbSchema:     event.schema || {},
            apiContract:  event.apiContract || {},
            schemaCode:   (event.schemaCode || '').slice(0, 100_000),
            backendCode:  (event.backendCode || '').slice(0, 100_000),
            seedData:     event.seedData || {},
            tasks:        event.taskSummary || [],
            durationMs:   Date.now() - startTime
          });
        } catch (saveErr) {
          console.warn('[AgentCollab] Could not save AgentRun result:', saveErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[AgentCollab] Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);

    if (agentRun) {
      try {
        await AgentRun.findByIdAndUpdate(agentRun._id, {
          status: 'failed',
          error: err.message,
          durationMs: Date.now() - startTime
        });
      } catch {}
    }
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/collab/runs
// List the user's past collaborative agent runs (summary only).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/runs', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum     = Math.max(1, parseInt(page, 10)  || 1);
    const clampedLimit= Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

    const [runs, total] = await Promise.all([
      AgentRun.find({ owner: req.user._id })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * clampedLimit)
        .limit(clampedLimit)
        .select('originalPrompt domain domainType needsBackend status reviewPassed tasks createdAt durationMs')
        .lean(),
      AgentRun.countDocuments({ owner: req.user._id })
    ]);

    res.json({
      runs: runs.map(r => ({
        id:            r._id,
        prompt:        r.originalPrompt?.slice(0, 80) || '',
        domain:        r.domain,
        domainType:    r.domainType,
        needsBackend:  r.needsBackend,
        status:        r.status,
        reviewPassed:  r.reviewPassed,
        taskCount:     r.tasks?.length || 0,
        completedTasks:r.tasks?.filter(t => t.status === 'done').length || 0,
        createdAt:     r.createdAt,
        durationMs:    r.durationMs
      })),
      pagination: {
        page: pageNum,
        limit: clampedLimit,
        total,
        pages: Math.ceil(total / clampedLimit)
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/collab/runs/:runId
// Get full details of a specific run (including message log).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/runs/:runId', async (req, res, next) => {
  try {
    const run = await AgentRun.findOne({
      _id: req.params.runId,
      owner: req.user._id
    }).lean();

    if (!run) return res.status(404).json({ error: 'Agent run not found' });

    res.json({
      run: {
        id:            run._id,
        prompt:        run.originalPrompt,
        domain:        run.domain,
        domainType:    run.domainType,
        needsBackend:  run.needsBackend,
        features:      run.features,
        tasks:         run.tasks,
        schema:        run.dbSchema || {},
        apiContract:   run.apiContract,
        schemaCode:    run.schemaCode,
        backendCode:   run.backendCode,
        seedData:      run.seedData,
        status:        run.status,
        reviewPassed:  run.reviewPassed,
        reviewIssues:  run.reviewIssues,
        messageLog:    run.messageLog,
        enhancedHtml:  run.enhancedHtml,
        createdAt:     run.createdAt,
        durationMs:    run.durationMs,
        error:         run.error
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

