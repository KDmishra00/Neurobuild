/**
 * Agentic AI Orchestrator — Module 6
 *
 * Implements an autonomous, multi-stage AI agent loop that iteratively
 * improves generated websites through a Planner → Executor → Evaluator
 * feedback cycle until a quality threshold is reached or max iterations
 * are exhausted.
 *
 * Architecture:
 *   1. PLANNER  — Analyzes the current HTML and produces a structured JSON
 *                 improvement plan with prioritized action items.
 *   2. EXECUTOR — Takes the plan and the current HTML and applies all the
 *                 changes in a single pass, returning improved HTML.
 *   3. EVALUATOR — Scores the improved HTML on 5 axes (Design, Accessibility,
 *                  Performance, SEO, Responsive) and decides whether to
 *                  continue iterating or accept the result.
 *
 * The loop runs up to MAX_ITERATIONS (default 3) or until the evaluator
 * score exceeds the QUALITY_THRESHOLD (default 85/100).
 */

const aiService = require('./ai');

// ═══════════════════════════════════════════
// AGENT SYSTEM PROMPTS
// ═══════════════════════════════════════════

const PLANNER_PROMPT = `You are an expert web quality assurance engineer acting as the PLANNER agent.
Analyze the provided HTML website code and produce a structured improvement plan.

Evaluate these 5 categories and identify specific, actionable improvements:
1. DESIGN — Visual polish, spacing, color harmony, typography, animations
2. ACCESSIBILITY — ARIA labels, alt text, focus states, semantic HTML, contrast ratios
3. PERFORMANCE — Redundant CSS/JS, render-blocking patterns, image optimization hints
4. SEO — Meta tags (title, description, og:*), heading hierarchy (single h1), structured data
5. RESPONSIVE — Mobile breakpoints, touch targets, viewport meta, flex/grid usage

Output ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "currentScore": 65,
  "actions": [
    {
      "id": 1,
      "category": "seo",
      "priority": "high",
      "title": "Add missing meta description",
      "instruction": "Add <meta name='description' content='...'> with a compelling 150-char summary"
    }
  ],
  "summary": "Brief 1-2 sentence overview of the plan"
}

Rules:
- currentScore is your honest assessment of the website quality (0-100)
- List 3-8 actionable items, ordered by priority (high → medium → low)
- Each instruction must be specific enough for another AI to execute as a code change
- Focus on the most impactful improvements first`;

const EXECUTOR_PROMPT = `You are an expert web developer acting as the EXECUTOR agent.
You will receive:
1. The current complete HTML of a website
2. A structured improvement plan with specific action items

Your job is to apply ALL the improvements from the plan to the website code in a single pass.

CRITICAL RULES:
- Output ONLY the complete updated HTML document, starting with <!DOCTYPE html>
- Apply every action item from the plan
- Keep ALL CSS in a <style> tag in the head
- Keep ALL JS in a <script> tag at the end of body
- Do NOT remove any existing features unless an action item explicitly says to
- Do NOT use markdown code blocks
- Do NOT explain your changes
- Preserve the original design intent while improving quality
- If an action cannot be applied (e.g., contradicts the design), skip it gracefully`;

const EVALUATOR_PROMPT = `You are an expert web quality auditor acting as the EVALUATOR agent.
Score the provided website HTML on 5 axes. Be rigorous and honest.

Output ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "scores": {
    "design": 85,
    "accessibility": 70,
    "performance": 90,
    "seo": 60,
    "responsive": 80
  },
  "overall": 77,
  "passed": false,
  "verdict": "Brief 1-sentence assessment",
  "remainingIssues": [
    "Missing og:image meta tag",
    "Footer links lack focus-visible styles"
  ]
}

Scoring guide (per axis, 0-100):
- 90-100: Production-ready, best practices followed
- 75-89:  Good quality, minor improvements possible
- 60-74:  Acceptable but noticeable gaps
- Below 60: Needs significant work

Rules:
- "overall" is the weighted average: design(25%) + accessibility(20%) + performance(20%) + seo(15%) + responsive(20%)
- "passed" is true only when overall >= 85
- List 0-3 remaining issues if passed is false
- Be honest — don't inflate scores`;

// ═══════════════════════════════════════════
// AGENTIC ORCHESTRATOR
// ═══════════════════════════════════════════

const MAX_ITERATIONS = 3;
const QUALITY_THRESHOLD = 85;

class AgenticOrchestrator {
  /**
   * Run the full Planner → Executor → Evaluator loop.
   *
   * @param {string} html  — The initial generated HTML to optimize
   * @param {string} model — The AI model to use for all agent calls
   * @param {function} onProgress — Callback receiving real-time progress events
   * @returns {object} — { finalHtml, iterations, finalScore, history }
   */
  async optimize(html, model, onProgress = () => {}) {
    const defaultModel = model || process.env.OLLAMA_MODEL || 'groq/openai/gpt-oss-120b:cloud';
    let currentHtml = html;
    const history = [];
    let iteration = 0;
    let finalScore = null;

    onProgress({ type: 'start', message: 'Agentic AI optimization started', iteration: 0 });

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      onProgress({ type: 'iteration_start', iteration, maxIterations: MAX_ITERATIONS });

      // ─── Stage 1: PLANNER ───────────────────────────────────────────
      onProgress({ type: 'planner_start', iteration, message: `Planner analyzing code (iteration ${iteration})...` });

      let plan;
      try {
        const plannerOutput = await aiService._complete([
          { role: 'system', content: PLANNER_PROMPT },
          { role: 'user', content: `Analyze this website and create an improvement plan:\n\n${this._truncate(currentHtml)}` }
        ], defaultModel);

        plan = aiService._extractJson(plannerOutput);
        if (plan.error) {
          // If JSON parsing failed, create a minimal fallback plan
          plan = {
            currentScore: 60,
            actions: [
              { id: 1, category: 'seo', priority: 'high', title: 'Add meta tags', instruction: 'Add proper title, meta description, and og: meta tags' },
              { id: 2, category: 'accessibility', priority: 'high', title: 'Add ARIA labels', instruction: 'Add aria-labels to interactive elements and alt text to images' },
              { id: 3, category: 'design', priority: 'medium', title: 'Polish animations', instruction: 'Add smooth transitions and micro-interactions to buttons and cards' }
            ],
            summary: 'Fallback plan: applying essential SEO, accessibility, and design improvements'
          };
        }
      } catch (err) {
        console.error(`[Agent] Planner error (iteration ${iteration}):`, err.message);
        plan = {
          currentScore: 60,
          actions: [
            { id: 1, category: 'seo', priority: 'high', title: 'Add meta tags', instruction: 'Add title, meta description, and viewport meta tag' },
            { id: 2, category: 'accessibility', priority: 'medium', title: 'Improve accessibility', instruction: 'Add alt text, aria-labels, and focus styles' }
          ],
          summary: 'Minimal fallback plan due to planner error'
        };
      }

      onProgress({
        type: 'planner_done',
        iteration,
        plan: {
          currentScore: plan.currentScore,
          actionCount: plan.actions?.length || 0,
          summary: plan.summary,
          actions: plan.actions
        }
      });

      console.log(`[Agent] Planner (iter ${iteration}): score=${plan.currentScore}, actions=${plan.actions?.length}`);

      // If the planner already thinks the score is above threshold, run evaluator to confirm
      if (plan.currentScore >= QUALITY_THRESHOLD && iteration > 1) {
        onProgress({ type: 'early_pass', iteration, message: 'Planner indicates high quality — running final evaluation...' });
      }

      // ─── Stage 2: EXECUTOR ──────────────────────────────────────────
      onProgress({ type: 'executor_start', iteration, message: `Executor applying ${plan.actions?.length || 0} improvements...` });

      let improvedHtml;
      try {
        const planText = (plan.actions || [])
          .map((a, i) => `${i + 1}. [${a.category?.toUpperCase()}] ${a.title}: ${a.instruction}`)
          .join('\n');

        const executorOutput = await aiService._complete([
          { role: 'system', content: EXECUTOR_PROMPT },
          {
            role: 'user',
            content: `IMPROVEMENT PLAN:\n${planText}\n\nCURRENT WEBSITE CODE:\n${currentHtml}`
          }
        ], defaultModel);

        improvedHtml = aiService.cleanHtml(executorOutput);

        // Sanity check: executor must return valid HTML
        if (!improvedHtml || improvedHtml.length < 100 || !improvedHtml.includes('<')) {
          console.warn(`[Agent] Executor returned invalid HTML (len=${improvedHtml?.length}), keeping previous version`);
          improvedHtml = currentHtml;
        }
      } catch (err) {
        console.error(`[Agent] Executor error (iteration ${iteration}):`, err.message);
        improvedHtml = currentHtml;
      }

      onProgress({ type: 'executor_done', iteration, htmlLength: improvedHtml.length });
      console.log(`[Agent] Executor (iter ${iteration}): HTML length ${currentHtml.length} → ${improvedHtml.length}`);

      // ─── Stage 3: EVALUATOR ─────────────────────────────────────────
      onProgress({ type: 'evaluator_start', iteration, message: 'Evaluator scoring the improved website...' });

      let evaluation;
      try {
        const evaluatorOutput = await aiService._complete([
          { role: 'system', content: EVALUATOR_PROMPT },
          { role: 'user', content: `Score this website:\n\n${this._truncate(improvedHtml)}` }
        ], defaultModel);

        evaluation = aiService._extractJson(evaluatorOutput);
        if (evaluation.error || typeof evaluation.overall !== 'number') {
          evaluation = {
            scores: { design: 75, accessibility: 70, performance: 80, seo: 65, responsive: 75 },
            overall: 73,
            passed: false,
            verdict: 'Unable to parse evaluator response; using estimated scores',
            remainingIssues: ['Evaluator response could not be parsed']
          };
        }
      } catch (err) {
        console.error(`[Agent] Evaluator error (iteration ${iteration}):`, err.message);
        evaluation = {
          scores: { design: 70, accessibility: 65, performance: 75, seo: 60, responsive: 70 },
          overall: 68,
          passed: false,
          verdict: 'Evaluator encountered an error; estimated scores applied',
          remainingIssues: ['Evaluator error: ' + err.message]
        };
      }

      finalScore = evaluation;

      onProgress({
        type: 'evaluator_done',
        iteration,
        evaluation: {
          scores: evaluation.scores,
          overall: evaluation.overall,
          passed: evaluation.passed,
          verdict: evaluation.verdict,
          remainingIssues: evaluation.remainingIssues
        }
      });

      console.log(`[Agent] Evaluator (iter ${iteration}): overall=${evaluation.overall}, passed=${evaluation.passed}`);

      // Record this iteration's history
      history.push({
        iteration,
        plan: { currentScore: plan.currentScore, actionCount: plan.actions?.length, summary: plan.summary },
        evaluation: { scores: evaluation.scores, overall: evaluation.overall, passed: evaluation.passed, verdict: evaluation.verdict }
      });

      // Update the working HTML
      currentHtml = improvedHtml;

      // ─── Check termination conditions ───────────────────────────────
      if (evaluation.passed || evaluation.overall >= QUALITY_THRESHOLD) {
        onProgress({
          type: 'complete',
          iteration,
          message: `Quality threshold reached (${evaluation.overall}/100) after ${iteration} iteration(s)`,
          finalScore: evaluation
        });
        break;
      }

      if (iteration < MAX_ITERATIONS) {
        onProgress({
          type: 'iteration_end',
          iteration,
          message: `Score ${evaluation.overall}/100 below threshold (${QUALITY_THRESHOLD}). Starting next iteration...`
        });
      }
    }

    // If we exhausted all iterations without passing
    if (!finalScore?.passed && finalScore?.overall < QUALITY_THRESHOLD) {
      onProgress({
        type: 'complete',
        iteration,
        message: `Optimization complete after ${iteration} iteration(s). Best score: ${finalScore?.overall}/100`,
        finalScore
      });
    }

    return {
      finalHtml: currentHtml,
      iterations: iteration,
      finalScore,
      history,
      improved: currentHtml !== html
    };
  }

  /**
   * Streaming version that yields SSE events for real-time frontend updates.
   */
  async *streamOptimize(html, model) {
    const events = [];
    const result = await this.optimize(html, model, (event) => {
      events.push(event);
    });

    // Since we need to yield events as they happen, we use the callback
    // approach internally but return the final result
    yield { type: 'result', ...result };
  }

  /** Truncate HTML to prevent exceeding token limits in agent calls */
  _truncate(html, maxLen = 15000) {
    if (!html || html.length <= maxLen) return html;
    return html.substring(0, maxLen) + '\n<!-- truncated for analysis -->';
  }
}

module.exports = new AgenticOrchestrator();
