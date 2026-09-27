// Using native Node.js fetch() with extended timeouts for local Ollama models.
// Ollama can take several minutes to load a model into RAM before returning
// the first token, and with stream:false it holds the whole response until
// generation finishes. Node's built-in fetch (undici) aborts with
// UND_ERR_HEADERS_TIMEOUT when no headers arrive within 5 minutes, so every
// Ollama request goes through a dedicated dispatcher with generous timeouts.
const { Agent, fetch: undiciFetch } = require('undici');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen3:14b';

// Ollama's context size is a server-side setting (OLLAMA_NUM_CTX); per-request
// num_ctx is ignored by the installed Ollama 0.30.7, so it is not sent here.
const ollamaDispatcher = new Agent({
  connectTimeout: 30_000,          // 30s to establish the connection
  headersTimeout: 30 * 60 * 1000,  // 30 min to the first byte (model load + first token)
  bodyTimeout: 45 * 60 * 1000      // 45 min for the full response body
});

/** fetch() to the local Ollama server with the extended-timeout dispatcher. */
function ollamaFetch(path, options = {}) {
  return undiciFetch(`${OLLAMA_URL}${path}`, { ...options, dispatcher: ollamaDispatcher });
}

/** Common Ollama chat options: keep the model warm between requests. */
function ollamaChatOptions(extra = {}) {
  return { keep_alive: '10m', ...extra };
}

// Pipeline model configuration
const PIPELINE_MODEL_GENERATOR = process.env.PIPELINE_MODEL_GENERATOR || DEFAULT_MODEL;
const PIPELINE_MODEL_REFINER = process.env.PIPELINE_MODEL_REFINER || DEFAULT_MODEL;

// Cloud API configuration
const CLOUD_API_URL = process.env.CLOUD_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
const CLOUD_API_KEY = process.env.CLOUD_API_KEY;

// NVIDIA NIM API configuration
const NVIDIA_API_URL = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

// Moonshot API configuration
const MOONSHOT_API_URL = process.env.MOONSHOT_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;

// Groq API configuration
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// OpenAI Direct API configuration
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI GPT-6 Astra & Experiential Labs Gateway configuration
const ASTRA_API_URL = process.env.ASTRA_API_URL || 'https://api.experientiallabs.ai/v1/chat/completions';
const ASTRA_API_KEY = process.env.ASTRA_API_KEY || 'xpl_f30e6a6bf7a0a0f1083a833814ee5c2d5994a784';

// ═══════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════

const SYSTEM_PROMPT = `You are an expert web developer specializing in modern, minimalistic website design.
When given a website description, generate a complete, beautiful, responsive website.

Requirements:
- Output ONLY raw HTML code starting with <!DOCTYPE html>
- Include all CSS inside a <style> tag in the head
- Include all JavaScript inside a <script> tag at the end of body
- Use modern CSS: flexbox, grid, CSS variables for theming
- Make it responsive with mobile-first approach
- Use Inter font family from Google Fonts
- Use minimal, clean design aesthetic with good whitespace
- Include smooth transitions and hover effects
- Do NOT use external CSS/JS files
- Do NOT explain anything
- Do NOT use markdown code blocks
- Do NOT output JSON — output ONLY raw HTML starting with <!DOCTYPE html>
- Just raw, complete HTML

CRITICAL FOR INTERACTIVE APPS (calculators, tools, games):
- Use proper JavaScript event listeners (addEventListener or onclick attributes)
- Never use eval() for calculations — write explicit arithmetic functions
- Maintain state variables (current input, previous input, operator)
- Handle edge cases: division by zero, decimal points, consecutive operators
- Add keyboard support (0-9, +, -, *, /, Enter, Escape, Backspace)
- Test logic mentally: 2+3=5, 10/3=3.333, 5*0=0, 1/0=Error
- Use descriptive variable names (not just a, b, x)
- Each button must have an onclick handler that calls a function
- IMPORTANT: Output HTML, NOT JSON. Start with <!DOCTYPE html>`;

// The primary generation route asks for separated code. Smaller local models
// occasionally return a full HTML document instead, so normalizeGeneratedSite
// below deliberately supports both formats.
const STRUCTURED_SITE_PROMPT = `You are an expert web developer. Build a complete, responsive website from the user's request.

Return ONLY valid JSON. Do not use markdown or add an explanation. The response must use this exact shape:
{
  "title": "Short website title",
  "html": "Semantic HTML for the page body only. Do not include style or script tags.",
  "css": "Complete CSS without style tags.",
  "js": "Optional vanilla JavaScript without script tags. Attach listeners after DOMContentLoaded when needed."
}

Rules:
- Use semantic HTML5, responsive CSS, accessible labels, visible focus styles, and descriptive image alt text.
- Do not use external JavaScript, iframes, embedded content, inline event handlers, or network requests.
- Do not include user data, secrets, tracking, or analytics.
- Keep the result self-contained and suitable for a sandboxed preview.`;

// Stage 1: Code Generator — Raw Code Generation
const GENERATOR_PROMPT = `You are an expert web developer. You will receive a user's website request.
Generate a complete, production-quality website based on this specification.

CRITICAL REQUIREMENTS:
- Output ONLY raw HTML code starting with <!DOCTYPE html>
- Include ALL CSS inside a <style> tag in the <head>
- Include ALL JavaScript inside a <script> tag at the end of <body>
- Use modern CSS: flexbox, grid, CSS custom properties for theming
- Make it fully responsive (mobile-first with min-width breakpoints)
- Use the exact colors, fonts, and sections from the specification
- Use Google Fonts (link in head): Inter for body, and any specified fonts
- Include smooth CSS transitions and hover effects
- Add subtle animations (fade-in on scroll, hover transforms)
- Use semantic HTML5 elements
- Do NOT use external CSS/JS files or CDN libraries (except Google Fonts)
- Do NOT explain anything — output raw HTML only
- Do NOT wrap in markdown code blocks
- Do NOT output JSON — output ONLY raw HTML starting with <!DOCTYPE html>
- Make the design feel premium and polished

CRITICAL FOR INTERACTIVE APPS (calculators, tools, converters, games):
- Write complete, working JavaScript with proper event handling
- NEVER use eval() for math — write explicit calculation functions
- Each interactive element MUST have onclick or event listener
- Maintain proper state (current value, previous value, operator)
- Handle edge cases: division by zero, decimal limits, invalid input
- Add keyboard support where appropriate
- Example calculator logic:
  let current = '0', previous = '', operator = '';
  function handleNumber(num) { ... }
  function handleOperator(op) { ... }
  function calculate() { /* explicit if/else for +,-,*,/ */ }
- Every function must be complete and working
- Test mentally: 2+3=5, 10/2=5, 0*5=0
- IMPORTANT: Output HTML, NOT JSON. Start with <!DOCTYPE html>`;

// Website editor — apply a user's requested change to an existing site
const EDIT_PROMPT = `You are an expert web developer. You will receive the complete HTML of an existing website along with an edit request from the user.
Your job is to apply the requested changes to the website code.

Follow the edit request precisely:
1. Make exactly the change the user asks for (colors, text, sections, layout, features, etc.)
2. Preserve every other part of the site exactly as it is — do not rewrite sections the request does not mention
3. If the request is ambiguous, make a reasonable, minimal interpretation
4. Keep the result clean, responsive and professional

CRITICAL RULES:
- Output ONLY the complete updated HTML document, starting with <!DOCTYPE html>
- Keep ALL CSS in a <style> tag in the head
- Keep ALL JS in a <script> tag at the end of body
- Do NOT remove features unless the edit request explicitly asks to
- Do NOT use markdown code blocks
- Do NOT explain your changes`;

// Stage 2: Refiner — Code Reviewer & Optimizer
const REFINER_PROMPT = `You are an expert code reviewer and optimizer for web development.
You will receive raw HTML/CSS/JS code for a website. Your job is to IMPROVE it.

Review and fix:
1. BUG FIXES: Fix any broken HTML structure, unclosed tags, invalid CSS properties
2. CSS OPTIMIZATION: Consolidate duplicate styles, ensure proper specificity, fix layout issues
3. RESPONSIVE POLISH: Ensure the site looks great on mobile (375px), tablet (768px), and desktop (1200px+)
4. ACCESSIBILITY: Add proper alt tags, aria labels, focus states, semantic elements
5. VISUAL POLISH: Improve spacing consistency, add subtle box-shadows, refine gradients, ensure text is readable
6. ANIMATION POLISH: Smooth out transitions, add subtle micro-interactions (button hover, card lift, fade-ins)
7. PERFORMANCE: Remove redundant code, optimize selectors

CRITICAL RULES:
- Output ONLY the improved HTML code starting with <!DOCTYPE html>
- Keep ALL CSS in a <style> tag in the head
- Keep ALL JS in a <script> tag at the end of body
- Do NOT remove any features — only improve them
- Do NOT explain your changes
- Do NOT use markdown code blocks
- Do NOT add external dependencies (except Google Fonts)
- Output the complete, improved HTML file`;

// Stage 1 (Parallel): Generates HTML & CSS ONLY
const PARALLEL_HTML_PROMPT = `You are an expert UI developer. Build the interface for this user request.
CRITICAL REQUIREMENTS:
- Output ONLY raw HTML code starting with <!DOCTYPE html>
- Include ALL CSS inside a <style> tag in the <head>
- Do NOT include ANY <script> tags or JavaScript. Another model will handle that.
- Make it fully responsive and visually stunning
- Ensure ID attributes are present on interactive elements (buttons, forms, carousels) so JS can attach to them.
- Make the design feel premium with modern CSS features.`;

// Stage 2 (Parallel): Generates JavaScript ONLY
const PARALLEL_JS_PROMPT = `You are an expert JavaScript developer.
You must generate the JavaScript logic to bring this website request to life.
CRITICAL REQUIREMENTS:
- Output ONLY pure JavaScript code. Do not wrap in <script> tags. Do not output HTML.
- Assume the HTML elements (buttons, forms, carousels, nav menus) already exist.
- Write modern ES6+ JS (event listeners, querySelectors, smooth scrolling).
- Implement interactive behaviors, micro-animations logic, and state management.
- Do NOT output any markdown code blocks. Just raw JS.`;

// Conversational Chat Prompt
const CHAT_SYSTEM_PROMPT = `You are Neurobuild AI, an expert web development assistant.
You help users build websites through conversation. You can:
1. Generate complete websites from descriptions
2. Modify existing HTML/CSS/JS code based on user requests
3. Explain design decisions and suggest improvements
4. Answer questions about web development

When the user asks you to CREATE or MODIFY a website:
- Include the complete HTML in your response wrapped in a special marker: |||HTML_START||| ... |||HTML_END|||
- The HTML should be complete (<!DOCTYPE html> ... </html>) with embedded CSS and JS
- Outside the markers, provide a brief conversational response

When the user asks a QUESTION or wants ADVICE:
- Respond conversationally without HTML markers
- Be concise, helpful, and specific

Always be friendly and professional. Keep explanations brief.`;

// Design System Prompt
const DESIGN_SYSTEM_PROMPT = `You are an expert UI/UX designer specializing in design systems.
Generate a complete design system based on the user's brand description.

Output ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "surface": "#hex",
    "text": "#hex",
    "textSecondary": "#hex",
    "success": "#hex",
    "warning": "#hex",
    "error": "#hex"
  },
  "fonts": {
    "heading": "Font Name",
    "body": "Font Name",
    "mono": "Font Name"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "xxl": "48px"
  },
  "borderRadius": {
    "sm": "4px",
    "md": "8px",
    "lg": "16px",
    "full": "9999px"
  },
  "cssVariables": "--primary: #hex; --secondary: #hex; ..."
}`;

// Content Generation Prompt
const CONTENT_PROMPT = `You are an expert copywriter for websites.
Generate compelling, professional website copy based on the user's request.

Output ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "headline": "Main headline text",
  "subheadline": "Supporting subheadline",
  "body": "Body paragraph text",
  "cta": "Call-to-action button text",
  "features": [
    { "title": "Feature 1", "description": "Description" },
    { "title": "Feature 2", "description": "Description" },
    { "title": "Feature 3", "description": "Description" }
  ]
}`;

// Improvement Suggestions Prompt
const SUGGEST_PROMPT = `You are an expert UI/UX reviewer.
Analyze the provided HTML website code and suggest specific improvements.

Output ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "score": 75,
  "suggestions": [
    {
      "category": "design|accessibility|performance|seo|responsive",
      "severity": "high|medium|low",
      "title": "Short title",
      "description": "What to improve and why",
      "fix": "Specific code or approach to fix it"
    }
  ]
}`;

class AIService {
  /** Normalize user input before it is incorporated into an AI instruction. */
  normalizePrompt(prompt) {
    return String(prompt || '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10_000);
  }

  /** Add stable requirements around the user's natural-language request. */
  buildWebsiteSpecification(prompt) {
    const normalized = this.normalizePrompt(prompt);
    if (!normalized) throw new Error('A website description is required');

    return [
      `Website request: ${normalized}`,
      'Create a polished, mobile-first single-page website.',
      'Include a clear heading, useful content sections, one primary action, and a footer.',
      'Use only self-contained HTML, CSS, and vanilla JavaScript.'
    ].join('\n');
  }

  /**
   * Generate a structured site object. The raw HTML fallback keeps the app
   * compatible with local models that do not reliably return JSON.
   */
  async generateSite(prompt, model = DEFAULT_MODEL) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ];
    const output = await this._complete(messages, model);
    return this.normalizeGeneratedSite(output);
  }

  /** Complete a non-streaming request with either configured provider. */
  async _complete(messages, model) {
    if (this.isExternalCloudModel(model)) {
      const { apiUrl, modelName, headers, isAstra } = this._resolveCloudConfig(model);
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          max_tokens: 4096,
          messages
        })
      });

      // Experiential Labs key fallback if 401
      if (!response.ok && isAstra && response.status === 401 && headers.Authorization !== 'Bearer xpl_f30e6a6bf7a0a0f1083a833814ee5c2d5994a784') {
        headers.Authorization = 'Bearer xpl_f30e6a6bf7a0a0f1083a833814ee5c2d5994a784';
        response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: modelName, max_tokens: 4096, messages })
        });
      }

      // Experiential Labs gpt-6-astra auto-fallback to gpt-6-sol if purchase is required
      if (!response.ok && isAstra && modelName === 'gpt-6-astra') {
        const errText = await response.text().catch(() => '');
        if (errText.includes('model_requires_purchase') || response.status === 429) {
          console.warn('[Cloud] gpt-6-astra requires credit purchase; automatically switching to gpt-6-sol');
          response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: 'gpt-6-sol', max_tokens: 4096, messages })
          });
        }
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        throw new Error(`Cloud API error (${response.status}): ${detail || 'no details from provider'}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }

    let response;
    try {
      response = await ollamaFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaChatOptions({ model, stream: false, messages }))
      });
    } catch (err) {
      throw new Error(`Cannot reach Ollama at ${OLLAMA_URL} (${err.cause?.code || err.message}). Is Ollama running and is the model pulled?`);
    }
    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
    const data = await response.json();
    return data.message?.content || '';
  }

  // ═══════════════════════════════════════════
  // PIPELINE METHODS (2-Stage)
  // ═══════════════════════════════════════════

  /**
   * Stage 1: Generate raw website code from prompt
   */
  async runGenerator(prompt, model = null) {
    const targetModel = model || process.env.PIPELINE_MODEL_GENERATOR || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
    console.log(`[Pipeline] Stage 1: Generating code with ${targetModel}...`);
    const specification = this.buildWebsiteSpecification(prompt);
    const response = await ollamaFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaChatOptions({
        model: targetModel,
        stream: false,
        messages: [
          { role: 'system', content: GENERATOR_PROMPT },
          { role: 'user', content: `Generate a complete website based on this specification:\n\n${specification}` }
        ]
      }))
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Generator (Stage 1) failed: ${error}`);
    }

    const data = await response.json();
    let html = data.message?.content || '';
    html = this.cleanHtml(html);
    console.log('[Pipeline] Stage 1 complete. HTML length:', html.length);
    return html;
  }

  /**
   * Apply a user's edit request to an existing generated site.
   * Routes through _complete so any model (local, Groq, NVIDIA NIM, cloud) works.
   */
  async editWebsite(rawHtml, instruction, model = null) {
    const targetModel = model || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
    console.log(`[Edit] Applying "${String(instruction).slice(0, 80)}" with ${targetModel}...`);
    const output = await this._complete([
      { role: 'system', content: EDIT_PROMPT },
      { role: 'user', content: `EDIT REQUEST:\n${instruction}\n\nCURRENT WEBSITE CODE:\n${rawHtml}` }
    ], targetModel);
    const html = this.cleanHtml(output);
    console.log('[Edit] Complete. HTML length:', html.length);
    return html;
  }

  /**
   * Stage 2: Refine and optimize the raw code
   */
  async runRefiner(rawHtml, instruction = 'Improve and optimize this website code:', model = null) {
    const targetModel = model || process.env.PIPELINE_MODEL_REFINER || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
    console.log(`[Pipeline] Stage 2: Refining code with ${targetModel}...`);
    const response = await ollamaFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaChatOptions({
        model: targetModel,
        stream: false,
        messages: [
          { role: 'system', content: REFINER_PROMPT },
          { role: 'user', content: `${instruction}\n\n${rawHtml}` }
        ]
      }))
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Refiner (Stage 2) failed: ${error}`);
    }

    const data = await response.json();
    let html = data.message?.content || '';
    html = this.cleanHtml(html);
    console.log('[Pipeline] Stage 2 complete. Final HTML length:', html.length);
    return html;
  }

  /**
   * Parallel Pipeline Processing Engine
   * Runs one model for HTML/CSS and another for JS at the same time.
   */
  async runParallel(spec) {
    console.log('[Pipeline] 🚀 Running Parallel Models...');
    const specification = this.buildWebsiteSpecification(spec);
    
    // Promise.all to run inferences simultaneously
    const [htmlOutput, jsOutput] = await Promise.all([
      // Worker A -> HTML/CSS
      ollamaFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaChatOptions({
          model: PIPELINE_MODEL_GENERATOR,
          stream: false,
          messages: [
            { role: 'system', content: PARALLEL_HTML_PROMPT },
            { role: 'user', content: `Generate the HTML and CSS for this specification:\n\n${specification}` }
          ]
        }))
      }).then(r => r.json()),
      
      // Worker B -> JavaScript
      ollamaFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaChatOptions({
          model: PIPELINE_MODEL_REFINER,
          stream: false,
          messages: [
            { role: 'system', content: PARALLEL_JS_PROMPT },
            { role: 'user', content: `Generate the JavaScript interactions for this specification:\n\n${specification}` }
          ]
        }))
      }).then(r => r.json())
    ]);

    let html = htmlOutput.message?.content || '';
    html = this.cleanHtml(html);
    
    let js = jsOutput.message?.content || '';
    // Clean markdown off JS
    js = js.replace(/^```(javascript|js)?\n?/i, '').replace(/```$/, '').trim();

    // 🚀 Merger: Combine HTML/CSS with JavaScript
    if (!html.includes('</body>')) {
        html += '\n<script>\n' + js + '\n</script>\n';
    } else {
        html = html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');
    }
    
    console.log('[Pipeline] 🚀 Parallel merge complete!');
    return html;
  }

  /**
   * 2-stage pipeline (non-streaming)
   * Returns { html, stages } with fallback if refiner fails
   */
  async generatePipeline(prompt, mode = 'sequential', model = null) {
    const stages = {
      generator: { status: 'pending', output: '' },
      refiner: { status: 'pending', output: '' }
    };
    
    const isSimple = prompt.length < 60 && !prompt.match(/ecommerce|dashboard|portfolio|complex|advanced/i);

    if (isSimple && mode === 'sequential') {
      // SMART OPTIMIZATION: Bypass Refiner
      console.log('[Pipeline] Smart Optimization: Simple prompt. Skipping refiner.');
      stages.generator.status = 'running';
      const rawHtml = await this.runGenerator(prompt, model);
      stages.generator.status = 'done';
      stages.generator.output = rawHtml;
      
      stages.refiner.status = 'skipped'; // Visual indicator
      return { html: rawHtml, stages, fallback: false };
    }

    if (mode === 'parallel') {
      // PRO LEVEL: Parallel Execution
      stages.generator.status = 'running';
      stages.refiner.status = 'running';
      try {
        const finalHtml = await this.runParallel(prompt);
        stages.generator.status = 'done';
        stages.refiner.status = 'done';
        stages.generator.output = 'Parallel HTML/CSS generated';
        stages.refiner.output = 'Parallel JS generated';
        return { html: finalHtml, stages, fallback: false };
      } catch (err) {
         throw new Error(`Parallel execution failed: ${err.message}`);
      }
    }

    // Default Sequential Execution
    stages.generator.status = 'running';
    const rawHtml = await this.runGenerator(prompt, model);
    stages.generator.status = 'done';
    stages.generator.output = rawHtml;

    // Stage 2: Refiner (with graceful fallback)
    try {
      stages.refiner.status = 'running';
      const refined = await this.runRefiner(rawHtml, 'Improve and optimize this website code:', model);
      stages.refiner.status = 'done';
      stages.refiner.output = refined;
      return { html: refined, stages, fallback: false };
    } catch (err) {
      console.warn('[Pipeline] Stage 2 failed, returning raw output:', err.message);
      stages.refiner.status = 'failed';
      stages.refiner.output = err.message;
      return { html: rawHtml, stages, fallback: true };
    }
  }

  /**
   * 2-stage pipeline with SSE streaming (yields progress events)
   */
  async *streamGeneratePipeline(prompt, mode = 'sequential') {
    const isSimple = prompt.length < 60 && !prompt.match(/ecommerce|dashboard|portfolio|complex|advanced/i);

    if (isSimple && mode === 'sequential') {
      // SMART OPTIMIZATION
      yield { type: 'stage', stage: 'generator', status: 'running' };
      const rawHtml = await this.runGenerator(prompt);
      yield { type: 'stage', stage: 'generator', status: 'done' };
      yield { type: 'stage', stage: 'refiner', status: 'skipped' };
      yield { type: 'done', html: rawHtml, fallback: false, skippedRefiner: true };
      return;
    }

    if (mode === 'parallel') {
      // PARALLEL PROCESSING
      yield { type: 'stage', stage: 'generator', status: 'running', label: 'Async HTML/CSS' };
      yield { type: 'stage', stage: 'refiner', status: 'running', label: 'Async JavaScript' };
      try {
        const finalHtml = await this.runParallel(prompt);
        yield { type: 'stage', stage: 'generator', status: 'done' };
        yield { type: 'stage', stage: 'refiner', status: 'done' };
        yield { type: 'done', html: finalHtml, fallback: false };
      } catch (err) {
        yield { type: 'stage', stage: 'generator', status: 'failed', error: 'Parallel execution failed' };
        yield { type: 'stage', stage: 'refiner', status: 'failed' };
        throw err;
      }
      return;
    }

    // Default Sequential Processing
    yield { type: 'stage', stage: 'generator', status: 'running' };
    let rawHtml;
    try {
      rawHtml = await this.runGenerator(prompt);
      yield { type: 'stage', stage: 'generator', status: 'done' };
    } catch (err) {
      yield { type: 'stage', stage: 'generator', status: 'failed', error: err.message };
      throw err;
    }

    // Stage 2: Refiner (graceful fallback)
    yield { type: 'stage', stage: 'refiner', status: 'running' };
    let finalHtml;
    let fallback = false;
    try {
      finalHtml = await this.runRefiner(rawHtml);
      yield { type: 'stage', stage: 'refiner', status: 'done' };
    } catch (err) {
      console.warn('[Pipeline] Stage 2 failed, using raw output:', err.message);
      yield { type: 'stage', stage: 'refiner', status: 'failed', error: err.message };
      finalHtml = rawHtml;
      fallback = true;
    }

    // Final result
    yield { type: 'done', html: finalHtml, fallback };
  }

  // ═══════════════════════════════════════════
  // SINGLE-MODEL METHODS (existing, preserved)
  // ═══════════════════════════════════════════

  // NVIDIA NIM model IDs (served via NVIDIA NIM)
  NVIDIA_NIM_MODELS = new Set([
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'nvidia/nemotron-mini-4b-instruct',
    'nvidia/nemotron-4-340b-instruct',
    'nvidia/nemotron-3-ultra',
    'deepseek-ai/deepseek-v4-flash-0731',
    'deepseek-ai/deepseek-r1',
    'mistralai/mistral-large-2-instruct',
    'zai/glm-5.2'
  ]);

  // External cloud models are provider IDs like "vendor/model:cloud".
  // Ollama cloud aliases (e.g. "kimi-k2.5:cloud") should stay on Ollama.
  // NVIDIA NIM models use "vendor/model:cloud" format but route to NVIDIA API.
  isExternalCloudModel(model) {
    return /.+\/.+:cloud$/.test(model || '') || 
           this.isMoonshotModel(model) || 
           this.isNvidiaModel(model) || 
           this.isGroqModel(model) ||
           this.isAstraModel(model) ||
           this.isOpenAIModel(model);
  }

  isNvidiaModel(model) {
    if (!model) return false;
    const cleanModel = model.replace(':cloud', '');
    return this.NVIDIA_NIM_MODELS.has(cleanModel) || 
           cleanModel.includes('nvidia') || 
           cleanModel.includes('nemotron') || 
           cleanModel.includes('glm') || 
           cleanModel.includes('llama-3') ||
           cleanModel.includes('deepseek-r1');
  }

  isMoonshotModel(model) {
    return (model || '').includes('moonshot-v1-');
  }

  isGroqModel(model) {
    return (model || '').includes('groq/');
  }

  isAstraModel(model) {
    if (!model) return false;
    const clean = String(model).toLowerCase();
    return clean.includes('gpt-6-astra') || clean.includes('astra') ||
           clean.includes('gpt-6-sol') || clean.includes('sol') ||
           clean.includes('gpt-6-luna') || clean.includes('luna') ||
           clean.includes('claude-opus-5.5') || clean.includes('experiential');
  }

  isOpenAIModel(model) {
    if (!model) return false;
    const clean = String(model).toLowerCase();
    if (this.isAstraModel(model)) return false;
    return clean.startsWith('openai/') || clean.includes('gpt-4o') || clean.includes('gpt-3.5') || clean.includes('gpt-4-turbo');
  }

  /** Resolve endpoint URL, API key, model ID and headers for any cloud model */
  _resolveCloudConfig(model) {
    const isAstra = this.isAstraModel(model);
    const isOpenAI = this.isOpenAIModel(model);
    const isNvidia = this.isNvidiaModel(model);
    const isMoonshot = this.isMoonshotModel(model);
    const isGroq = this.isGroqModel(model);

    let apiUrl = CLOUD_API_URL;
    let apiKey = CLOUD_API_KEY;
    let modelName = (model || '').replace(':cloud', '').replace(/^groq\//, '');

    if (isAstra) {
      apiUrl = process.env.ASTRA_API_URL || ASTRA_API_URL;
      apiKey = process.env.ASTRA_API_KEY || ASTRA_API_KEY;
      const clean = String(model).toLowerCase();
      if (clean.includes('gpt-6-sol') || clean.includes('sol')) {
        modelName = 'gpt-6-sol';
      } else if (clean.includes('gpt-6-luna') || clean.includes('luna')) {
        modelName = 'gpt-6-luna';
      } else if (clean.includes('claude-opus-5.5')) {
        modelName = 'claude-opus-5.5';
      } else {
        modelName = 'gpt-6-astra';
      }
    } else if (isOpenAI) {
      apiUrl = OPENAI_API_URL;
      apiKey = OPENAI_API_KEY;
      modelName = modelName.replace(/^openai\//, '');
    } else if (isGroq) {
      apiUrl = GROQ_API_URL;
      apiKey = GROQ_API_KEY;
    } else if (isMoonshot) {
      apiUrl = MOONSHOT_API_URL;
      apiKey = MOONSHOT_API_KEY;
    } else if (isNvidia) {
      apiUrl = NVIDIA_API_URL;
      apiKey = NVIDIA_API_KEY;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    if (!isNvidia && !isGroq && !isAstra && !isOpenAI) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Neurobuild';
    }

    return { apiUrl, apiKey, modelName, headers, isAstra, isOpenAI, isNvidia, isMoonshot, isGroq };
  }

  // Backward-compatible helper
  isCloudModel(model) {
    return this.isExternalCloudModel(model);
  }

  // Generate using cloud API (OpenAI-compatible format)
  async generateCloud(prompt, model) {
    const { apiUrl, modelName, headers } = this._resolveCloudConfig(model);
    
    console.log(`[Cloud] Generating with model: ${modelName} via ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Create a website: ${prompt}` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud API error: ${errText}`);
    }

    const data = await response.json();
    let html = data.choices?.[0]?.message?.content || '';
    html = this.cleanHtml(html);
    return html;
  }

  // Stream generate using cloud API (OpenAI-compatible SSE format)
  async *streamCloud(prompt, model, onChunk) {
    const { apiUrl, modelName, headers, isAstra } = this._resolveCloudConfig(model);
    
    console.log(`[Cloud Stream] Generating with model: ${modelName} via ${apiUrl}`);

    let response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        stream: true,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Create a website: ${prompt}` }
        ]
      })
    });

    // Experiential Labs key fallback if 401
    if (!response.ok && isAstra && response.status === 401 && headers.Authorization !== 'Bearer xpl_f30e6a6bf7a0a0f1083a833814ee5c2d5994a784') {
      headers.Authorization = 'Bearer xpl_f30e6a6bf7a0a0f1083a833814ee5c2d5994a784';
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          stream: true,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Create a website: ${prompt}` }
          ]
        })
      });
    }

    // Experiential Labs gpt-6-astra auto-fallback to gpt-6-sol if purchase is required
    if (!response.ok && isAstra && modelName === 'gpt-6-astra') {
      const errText = await response.text().catch(() => '');
      if (errText.includes('model_requires_purchase') || response.status === 429) {
        console.warn('[Cloud Stream] gpt-6-astra requires credit purchase; automatically switching to gpt-6-sol');
        response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'gpt-6-sol',
            stream: true,
            max_tokens: 4096,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Create a website: ${prompt}` }
            ]
          })
        });
      }
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      throw new Error(`Cloud API error (${response.status}): ${detail || 'no details from provider'}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const payload = line.trim().slice(6);
            if (payload === '[DONE]') return;
            try {
              const data = JSON.parse(payload);
              if (data.choices?.[0]?.delta?.content) {
                yield data.choices[0].delta.content;
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async generate(prompt, model = DEFAULT_MODEL) {
    // Use streaming internally to prevent Node.js fetch HeadersTimeoutError 
    // when Ollama takes >5 minutes to generate a full website.
    let html = '';
    for await (const chunk of this.streamGenerate(prompt, model)) {
      html += chunk;
    }
    return this.cleanHtml(html);
  }

  async *streamGenerate(prompt, model = DEFAULT_MODEL) {
    // Use cloud streaming for cloud models
    if (this.isExternalCloudModel(model)) {
      yield* this.streamCloud(prompt, model);
      return;
    }

    // Use Ollama streaming for local models
    const response = await ollamaFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaChatOptions({
        model,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Create a website: ${prompt}` }
        ]
      }))
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                yield data.message.content;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ═══════════════════════════════════════════
  // CHAT METHODS
  // ═══════════════════════════════════════════

  /**
   * Multi-turn chat generation (non-streaming).
   * @param {Array} messages - Array of { role, content } objects
   * @param {string} model - Model identifier
   * @returns {object} { reply, html } — reply is the text, html is extracted if present
   */
  async chatGenerate(messages, model = DEFAULT_MODEL) {
    const chatMessages = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    let fullReply = '';
    for await (const chunk of this._streamOllamaChat(chatMessages, model)) {
      fullReply += chunk;
    }

    return this._parseChatReply(fullReply);
  }

  /**
   * Multi-turn chat generation with SSE streaming.
   * Yields { type: 'chunk', content } and finally { type: 'done', reply, html }.
   */
  async *streamChatGenerate(messages, model = DEFAULT_MODEL) {
    const chatMessages = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    let fullReply = '';
    for await (const chunk of this._streamOllamaChat(chatMessages, model)) {
      fullReply += chunk;
      yield { type: 'chunk', content: chunk };
    }

    const parsed = this._parseChatReply(fullReply);
    yield { type: 'done', reply: parsed.reply, html: parsed.html };
  }

  /** Internal: stream chat from Ollama or cloud */
  async *_streamOllamaChat(messages, model) {
    if (this.isExternalCloudModel(model)) {
      const { apiUrl, modelName, headers } = this._resolveCloudConfig(model);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: modelName, stream: true, max_tokens: 4096, messages })
      });
      if (!response.ok) throw new Error(`Cloud API error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const payload = line.trim().slice(6);
              if (payload === '[DONE]') return;
              try {
                const data = JSON.parse(payload);
                if (data.choices?.[0]?.delta?.content) yield data.choices[0].delta.content;
              } catch {}
            }
          }
        }
      } finally { reader.releaseLock(); }
      return;
    }

    // Ollama streaming
    const response = await ollamaFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaChatOptions({ model, stream: true, messages }))
    });
    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) yield data.message.content;
            } catch {}
          }
        }
      }
    } finally { reader.releaseLock(); }
  }

  /** Extract HTML from chat reply if |||HTML_START||| ... |||HTML_END||| markers are present */
  _parseChatReply(fullReply) {
    const htmlMatch = fullReply.match(/\|\|\|HTML_START\|\|\|(\s*[\s\S]*?)\|\|\|HTML_END\|\|\|/);
    let html = '';
    let reply = fullReply;

    if (htmlMatch) {
      html = this.cleanHtml(htmlMatch[1].trim());
      reply = fullReply
        .replace(/\|\|\|HTML_START\|\|\|[\s\S]*?\|\|\|HTML_END\|\|\|/, '')
        .trim();
    } else {
      // Fallback: check if the entire reply is HTML
      const trimmed = fullReply.trim();
      if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.startsWith('<html')) {
        html = this.cleanHtml(trimmed);
        reply = 'Here\'s the generated website.';
      }
    }

    return { reply, html };
  }

  // ═══════════════════════════════════════════
  // AI ENHANCEMENT METHODS
  // ═══════════════════════════════════════════

  /**
   * Generate a design system (color palette, fonts, spacing) from a brand description.
   */
  async generateDesignSystem(prompt, model = DEFAULT_MODEL) {
    let result = '';
    for await (const chunk of this._streamOllamaChat([
      { role: 'system', content: DESIGN_SYSTEM_PROMPT },
      { role: 'user', content: `Create a design system for: ${prompt}` }
    ], model)) {
      result += chunk;
    }
    // Try to parse JSON from the response
    return this._extractJson(result);
  }

  /**
   * Generate website copy/content for a specific section type.
   */
  async generateContent(prompt, type = 'general', model = DEFAULT_MODEL) {
    let result = '';
    for await (const chunk of this._streamOllamaChat([
      { role: 'system', content: CONTENT_PROMPT },
      { role: 'user', content: `Generate ${type} content for a website about: ${prompt}` }
    ], model)) {
      result += chunk;
    }
    return this._extractJson(result);
  }

  /**
   * Analyze HTML and suggest improvements.
   */
  async suggestImprovements(html, model = DEFAULT_MODEL) {
    // Truncate HTML if too long to avoid token limits
    const truncatedHtml = html.length > 15_000 ? html.substring(0, 15_000) + '\n<!-- truncated -->' : html;
    let result = '';
    for await (const chunk of this._streamOllamaChat([
      { role: 'system', content: SUGGEST_PROMPT },
      { role: 'user', content: `Analyze and suggest improvements for this website:\n\n${truncatedHtml}` }
    ], model)) {
      result += chunk;
    }
    return this._extractJson(result);
  }

  /** Try to extract a JSON object from a model response that may contain extra text */
  _extractJson(text) {
    // Try direct parse first
    try { return JSON.parse(text.trim()); } catch {}
    // Try to find JSON in markdown code block
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      try { return JSON.parse(codeBlock[1].trim()); } catch {}
    }
    // Try to find first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { return JSON.parse(braceMatch[0]); } catch {}
    }
    // Try to find JSON after "json" marker (model sometimes outputs json\n{...})
    const jsonMarker = text.match(/json\s*\n\s*(\{[\s\S]*\})/);
    if (jsonMarker) {
      try { return JSON.parse(jsonMarker[1]); } catch {}
    }
    return { error: 'Could not parse AI response', raw: text.substring(0, 500) };
  }

  /**
   * Convert either the preferred JSON response or legacy full HTML into one
   * predictable, size-limited site object for the API and database layers.
   */
  normalizeGeneratedSite(output) {
    const raw = String(output || '').trim();
    if (!raw) throw new Error('The AI returned an empty website');

    const parsed = this._extractJson(raw);
    const hasStructuredFields = !parsed.error && parsed &&
      ['html', 'css', 'js'].some(key => typeof parsed[key] === 'string');
    const source = hasStructuredFields
      ? parsed
      : { html: raw, css: '', js: '', title: '' };
    const legacyParts = this._splitHtmlDocument(source.html || '');
    const title = this._sanitizeText(source.title || legacyParts.title || 'Generated website', 80);
    const html = this._replacePlaceholderImages(this._buildHtmlShell(legacyParts.head, legacyParts.body, title));
    const css = this._replacePlaceholderImages(this._sanitizeCss([legacyParts.css, source.css].filter(Boolean).join('\n')));
    const js = this._sanitizeJavaScript([legacyParts.js, source.js].filter(Boolean).join('\n'));

    // Post-process: Add onclick handlers to buttons that lack them
    const fixedHtml = this._fixMissingButtonHandlers(html, js);
    const fixedJs = this._ensureButtonHandlers(js);

    const document = this.buildWebsiteDocument({ title, html: fixedHtml, css, js: fixedJs });

    if (!legacyParts.body.trim()) {
      throw new Error('The AI response did not contain any page content');
    }
    if (document.length > 2_000_000) {
      throw new Error('The generated website is too large to save');
    }

    return {
      title,
      html: fixedHtml,
      css,
      js: fixedJs,
      document,
      structured: hasStructuredFields
    };
  }

  /** Add onclick handlers to buttons that have text but no onclick */
  _fixMissingButtonHandlers(html, js) {
    if (!html || !html.includes('<button')) return html;

    const f = this._resolveCalculatorFunctionNames(js);
    // Map button text to function calls. Inner strings use single quotes so the
    // generated onclick attribute stays valid HTML: onclick="appendNumber('7')".
    // (Double quotes inside a double-quoted attribute previously produced
    // mangled tags like <button7")>7.)
    const buttonMap = {
      '0': `${f.number}('0')`, '1': `${f.number}('1')`, '2': `${f.number}('2')`,
      '3': `${f.number}('3')`, '4': `${f.number}('4')`, '5': `${f.number}('5')`,
      '6': `${f.number}('6')`, '7': `${f.number}('7')`, '8': `${f.number}('8')`,
      '9': `${f.number}('9')`,
      '+': `${f.operator}('+')`, '-': `${f.operator}('-')`, '−': `${f.operator}('-')`,
      '*': `${f.operator}('*')`, '×': `${f.operator}('*')`,
      '/': `${f.operator}('/')`, '÷': `${f.operator}('/')`,
      '=': `${f.calculate}()`, 'C': `${f.clear}()`, 'AC': `${f.clear}()`,
      '.': `${f.decimal}()`, '%': `${f.percentage}()`, '±': `${f.negate}()`,
      'DEL': `${f.del}()`, '⌫': `${f.del}()`, 'backspace': `${f.del}()`
    };

    // Replace buttons without onclick
    return html.replace(/<button([^>]*)>([^<]*)<\/button>/gi, (match, attrs, text) => {
      const trimmedText = text.trim();
      if (attrs.includes('onclick')) return match; // Already has handler
      const handler = buttonMap[trimmedText];
      if (handler) {
        return `<button${attrs} onclick="${handler}">${text}</button>`;
      }
      return match;
    });
  }

  /** Ensure JavaScript has the handler functions that buttons call */
  _ensureButtonHandlers(js) {
    if (!js) return js;

    // If the model already wrote calculator functions (handleNumber,
    // appendNumber, …), wire buttons to whichever names it actually used.
    if (js.includes('handleNumber') || js.includes('appendNumber')) {
      return js + this._buttonFallbackScript(js);
    }

    // Add calculator functions if missing
    const calcFunctions = `
var _current = '0', _prev = '', _op = '', _newNum = true;
function handleNumber(n) {
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (!el) return;
  if (_newNum) { _current = n; _newNum = false; }
  else { _current = _current === '0' ? n : _current + n; }
  el.textContent = _current;
}
function handleOperator(op) {
  if (_prev && _op && !_newNum) calculate();
  _prev = _current; _op = op; _newNum = true;
}
function handleDecimal() {
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (!el) return;
  if (_newNum) { _current = '0.'; _newNum = false; }
  else if (_current.indexOf('.') === -1) { _current += '.'; }
  el.textContent = _current;
}
function handlePercentage() {
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (!el) return;
  _current = String(parseFloat(_current) / 100);
  el.textContent = _current;
}
function handleNegate() {
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (!el || _current === '0') return;
  _current = _current.charAt(0) === '-' ? _current.slice(1) : '-' + _current;
  el.textContent = _current;
}
function clearAll() {
  _current = '0'; _prev = ''; _op = ''; _newNum = true;
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (el) el.textContent = '0';
}
function deleteLast() {
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (!el) return;
  _current = _current.length > 1 ? _current.slice(0, -1) : '0';
  el.textContent = _current;
}
function calculate() {
  var a = parseFloat(_prev), b = parseFloat(_current), r;
  if (_op === '+') r = a + b;
  else if (_op === '-' || _op === '−') r = a - b;
  else if (_op === '*' || _op === '×') r = a * b;
  else if (_op === '/' || _op === '÷') r = b === 0 ? 'Error' : a / b;
  else return;
  _current = String(typeof r === 'number' ? parseFloat(r.toFixed(10)) : r);
  var el = document.getElementById('display') || document.querySelector('.display') || document.querySelector('[id*=display]');
  if (el) el.textContent = _current;
  _prev = ''; _op = ''; _newNum = true;
}
document.addEventListener('keydown', function(e) {
  if ('0123456789'.indexOf(e.key) !== -1) handleNumber(e.key);
  else if (e.key === '.') handleDecimal();
  else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') handleOperator(e.key);
  else if (e.key === 'Enter' || e.key === '=') calculate();
  else if (e.key === 'Escape') clearAll();
  else if (e.key === '%') handlePercentage();
  else if (e.key === 'Backspace') deleteLast();
});`;

    return js + calcFunctions + this._buttonFallbackScript(js);
  }

  /**
   * Discover which calculator function names the model actually defined so the
   * injected button wiring calls real functions. Naming varies between models
   * (handleNumber vs appendNumber, setOperator vs handleOperator vs
   * appendOperator, calculate vs calculateResult, …), so known names are tried
   * first, then any defined function whose name matches the role's pattern.
   */
  _resolveCalculatorFunctionNames(js) {
    const names = new Set();
    const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(String(js || '')))) names.add(m[1]);

    const pick = (...candidates) => candidates.find(c => names.has(c)) || '';
    const findLike = (pattern) => [...names].find(n => pattern.test(n)) || '';

    return {
      number: pick('appendNumber', 'handleNumber') || findLike(/number|digit/i) || 'handleNumber',
      decimal: pick('appendDecimal', 'handleDecimal') || findLike(/decimal|point/i) || 'handleDecimal',
      operator: pick('setOperator', 'handleOperator', 'appendOperator') || findLike(/operator|operation/i) || 'handleOperator',
      calculate: pick('calculateResult', 'calculate') || findLike(/calculat|result|equals/i) || 'calculate',
      clear: pick('clearDisplay', 'clearAll') || findLike(/clear|reset/i) || 'clearAll',
      del: pick('deleteDigit', 'deleteLast') || findLike(/delete|backspace|erase/i) || 'deleteLast',
      percentage: pick('handlePercentage', 'percentage') || 'handlePercentage',
      negate: pick('handleNegate', 'negate') || 'handleNegate'
    };
  }

  /**
   * Inject a DOMContentLoaded handler that wires calculator buttons to the
   * exact functions the model defined (resolved server-side from the generated
   * JS, so the injected code always calls functions that actually exist).
   */
  _buttonFallbackScript(js) {
    const f = this._resolveCalculatorFunctionNames(js);
    return `
document.addEventListener('DOMContentLoaded', function() {
  var btns = document.querySelectorAll('button');
  btns.forEach(function(btn) {
    if (btn.getAttribute('onclick')) return;
    var t = btn.textContent.trim();
    if ('0123456789'.indexOf(t) !== -1) btn.onclick = function() { ${f.number}(t); };
    else if (t === '.') btn.onclick = function() { ${f.decimal}(); };
    else if (t === '+' || t === '-' || t === '−') btn.onclick = function() { ${f.operator}(t === '−' ? '-' : t); };
    else if (t === '*' || t === '×') btn.onclick = function() { ${f.operator}('*'); };
    else if (t === '/' || t === '÷') btn.onclick = function() { ${f.operator}('/'); };
    else if (t === '=') btn.onclick = function() { ${f.calculate}(); };
    else if (t === 'C' || t === 'AC') btn.onclick = function() { ${f.clear}(); };
    else if (t === '%') btn.onclick = function() { ${f.percentage}(); };
    else if (t === '±' || t === '+/-') btn.onclick = function() { ${f.negate}(); };
    else if (t === 'DEL' || t === '⌫') btn.onclick = function() { ${f.del}(); };
  });
});`;
  }

  /** Rebuild an exported document from validated individual code sections. */
  buildWebsiteDocument({ title = 'Generated website', html = '', css = '', js = '' }) {
    const parts = this._splitHtmlDocument(html);
    const safeTitle = this._escapeHtml(this._sanitizeText(title || parts.title || 'Generated website', 80));
    const safeCss = this._sanitizeCss(css);
    const safeJs = this._sanitizeJavaScript(js);
    const styleTag = safeCss ? `\n<style>\n${safeCss}\n</style>` : '';
    const scriptTag = safeJs ? `\n<script>\n${safeJs}\n</script>` : '';

    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${safeTitle}</title>${parts.head}${styleTag}\n</head>\n<body>\n${parts.body}\n${scriptTag}\n</body>\n</html>`;
  }

  /** Split a full document or fragment into separate presentation layers. */
  _splitHtmlDocument(input) {
    let source = String(input || '')
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const css = [];
    const js = [];

    source = source.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, content) => {
      css.push(content);
      return '';
    });
    source = source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match, content) => {
      // External scripts are deliberately excluded from generated projects.
      if (!/\bsrc\s*=/i.test(match)) js.push(content);
      return '';
    });

    const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    const head = this._sanitizeHead(headMatch?.[1] || '');
    let body = bodyMatch?.[1] || source;
    body = body
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '');

    return {
      title: titleMatch?.[1] || '',
      head,
      body: this._sanitizeMarkup(body),
      css: css.join('\n'),
      js: js.join('\n')
    };
  }

  _buildHtmlShell(head, body, title) {
    const safeTitle = this._escapeHtml(this._sanitizeText(title, 80));
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${safeTitle}</title>${head}\n</head>\n<body>\n${body}\n</body>\n</html>`;
  }

  _sanitizeHead(head) {
    return String(head || '')
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
      .replace(/<base\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
      .replace(/<link\b[^>]*>/gi, link =>
        /href\s*=\s*["']https:\/\/fonts\.googleapis\.com\//i.test(link) ? link : '')
      .replace(/<[^>]+\s(?:on\w+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi, '');
  }

  _sanitizeMarkup(markup) {
    return String(markup || '')
      .replace(/<\/?(?:iframe|object|embed|base)\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
      .replace(/\s(?:on\w+|srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, '');
  }

  _sanitizeCss(css) {
    return String(css || '')
      .replace(/<\/?style\b[^>]*>/gi, '')
      .replace(/@import\s+[^;]+;/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/url\s*\(\s*['"]?\s*javascript:[^)]+\)/gi, '')
      .trim();
  }

  _sanitizeJavaScript(js) {
    return String(js || '')
      .replace(/^```(?:javascript|js)?\s*/i, '')
      .replace(/\s*```$/, '')
      .replace(/<\/?script\b[^>]*>/gi, '')
      // Preview isolation is enforced by CSP and iframe sandboxing as well.
      .replace(/\b(?:window\.)?(?:top|parent|opener)\b/g, 'undefined')
      .replace(/\bdocument\.cookie\b/g, '""')
      .replace(/\b(?:localStorage|sessionStorage)\b/g, 'undefined')
      .replace(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/g, 'undefined')
      .trim();
  }

  _sanitizeText(text, maxLength) {
    return String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ═══════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════

  /**
   * Replace external placeholder image services (via.placeholder.com,
   * placehold.co, dummyimage.com) with self-contained inline SVG data URIs.
   * Generated sites then always render their images without depending on
   * third-party services that may be slow, blocked, or offline.
   */
  _replacePlaceholderImages(html) {
    if (!html || typeof html !== 'string') return html;

    const placeholderHost = /(?:via\.placeholder\.com|placehold\.co|dummyimage\.com)/i;

    const svgDataUri = (url) => {
      let width = 800;
      let height = 600;
      const size = url.match(/(\d{2,4})x(\d{2,4})/);
      if (size) {
        width = parseInt(size[1], 10);
        height = parseInt(size[2], 10);
      }

      let label = 'Image';
      const textParam = url.match(/[?&]text=([^&#"'()\s]+)/i);
      if (textParam) {
        label = decodeURIComponent(textParam[1].replace(/\+/g, ' ')).slice(0, 48);
      }
      const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Deterministic gradient derived from the URL so each image is stable
      let seed = 0;
      for (let i = 0; i < url.length; i += 1) seed = (seed * 31 + url.charCodeAt(i)) % 9973;
      const hue1 = seed % 360;
      const hue2 = (hue1 + 60 + (seed % 90)) % 360;
      const fontSize = Math.max(14, Math.round(Math.min(width, height) / 12));

      const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
        `<defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'>` +
        `<stop offset='0%' stop-color='hsl(${hue1},65%,55%)'/><stop offset='100%' stop-color='hsl(${hue2},70%,45%)'/>` +
        `</linearGradient></defs>` +
        `<rect width='${width}' height='${height}' fill='url(#g)'/>` +
        `<text x='50%' y='50%' font-family='-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' font-size='${fontSize}' fill='rgba(255,255,255,0.95)' text-anchor='middle' dominant-baseline='middle'>${safeLabel}</text>` +
        `</svg>`;
      // Encode single quotes too so the data URI is safe inside src='...' and
      // url('...') contexts regardless of the surrounding quote style.
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
    };

    // 1) <img src="..."> / src='...' / src=...
    html = html.replace(
      /(<img\b[^>]*?\bsrc\s*=\s*["']?)(https?:\/\/[^"'\s>]+)(["']?)/gi,
      (match, prefix, url, suffix) => (placeholderHost.test(url) ? `${prefix}${svgDataUri(url)}${suffix}` : match)
    );

    // 2) CSS url(...) references (inline styles and <style> blocks)
    html = html.replace(
      /url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/gi,
      (match, url) => (placeholderHost.test(url) ? `url("${svgDataUri(url)}")` : match)
    );

    return html;
  }

  cleanHtml(html) {
    // Clean up markdown code fences if present
    html = html
      .replace(/^```html\n?/i, '')
      .replace(/^```\n?/, '')
      .replace(/```$/, '')
      .trim();

    // Ensure it starts with DOCTYPE
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>\n${html}`;
    }

    return this._replacePlaceholderImages(html);
  }

  formatBytes(bytes) {
    if (!bytes) return 'unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  }

  async getOllamaModels() {
    const configuredModel = process.env.OLLAMA_MODEL || 'qwen3:14b';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await ollamaFetch('/api/tags', { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          return data.models.map(m => ({
            id: m.name,
            name: `${m.name} (${this.formatBytes(m.size)})`,
            type: 'local',
            description: `Ollama Local Model (${this.formatBytes(m.size)})`
          }));
        }
      }
    } catch (err) {
      console.warn('Ollama tags endpoint unreachable or timed out, returning configured model.');
    }

    return [{
      id: configuredModel,
      name: `${configuredModel} (Local)`,
      type: 'local',
      description: 'Ollama Local Model'
    }];
  }

  // Simple in-memory cache
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  getCacheKey(prompt, model) {
    return `${model}:${prompt.trim().toLowerCase()}`;
  }

  getCached(prompt, model) {
    const key = this.getCacheKey(prompt, model);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < this.cacheTimeout) {
      return cached.html;
    }
    this.cache.delete(key);
    return null;
  }

  setCached(prompt, model, html) {
    const key = this.getCacheKey(prompt, model);
    this.cache.set(key, { html, time: Date.now() });

    // Limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}

module.exports = new AIService();
