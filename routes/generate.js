const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const aiService = require('../services/ai');
const { auth } = require('../middleware/auth');
const { requireDb } = require('../middleware/db');
const { validateGenerate } = require('../middleware/validate');
const User = require('../models/User');

// Ensure database connection is ready for any generation or model route
router.use(requireDb);

// Check whether a required cloud API key is configured
function hasValidApiKey(model) {
  // Ollama Cloud aliases (no slash, e.g. "deepseek-v4-flash:cloud") run
  // through the local Ollama server and need no API key here.
  if (!String(model).includes('/')) return true;
  if (aiService.isGroqModel(model)) {
    return true; // Groq is available with built-in/env key
  }
  if (aiService.isAstraModel(model)) {
    return true; // Astra is routed seamlessly to Groq
  }
  if (aiService.isOpenAIModel(model)) {
    return !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your_');
  }
  if (aiService.isNvidiaModel(model)) {
    return !!process.env.NVIDIA_API_KEY && !process.env.NVIDIA_API_KEY.includes('your_');
  }
  if (aiService.isMoonshotModel(model)) {
    return !!process.env.MOONSHOT_API_KEY && !process.env.MOONSHOT_API_KEY.includes('your_');
  }
  if (aiService.isDeepSeekModel(model)) {
    return !!process.env.DEEPSEEK_API_KEY && !process.env.DEEPSEEK_API_KEY.includes('your_');
  }
  return !!process.env.CLOUD_API_KEY && !process.env.CLOUD_API_KEY.includes('your_');
}

// Supported Cloud Model Options
const STATIC_MODEL_OPTIONS = [
  {
    id: 'groq/openai/gpt-oss-120b:cloud',
    name: 'OpenAI GPT-OSS 120B (Groq — Recommended)',
    type: 'cloud',
    provider: 'Groq',
    description: 'OpenAI GPT-OSS 120B — blazing fast (~500 tokens/sec) on Groq LPU'
  },
  {
    id: 'groq/openai/gpt-oss-20b:cloud',
    name: 'OpenAI GPT-OSS 20B (Groq)',
    type: 'cloud',
    provider: 'Groq',
    description: 'OpenAI GPT-OSS 20B — ultra-fast generation (~1,000 tokens/sec) on Groq LPU'
  },
  {
    id: 'groq/qwen/qwen3.8-27b:cloud',
    name: 'Qwen 3.8 27B (Groq)',
    type: 'cloud',
    provider: 'Groq',
    description: 'Alibaba Qwen 3.8 27B — high-performance open model on Groq LPU'
  },
  {
    id: 'openai/gpt-6-astra:cloud',
    name: 'OpenAI GPT-6 Astra (Experiential Labs)',
    type: 'cloud',
    provider: 'Experiential Labs',
    description: 'OpenAI GPT-6 Astra — flagship model (auto-routes to Groq if key expired)'
  },
  {
    id: 'openai/gpt-6-sol:cloud',
    name: 'OpenAI GPT-6 Sol (Experiential Labs)',
    type: 'cloud',
    provider: 'Experiential Labs',
    description: 'OpenAI GPT-6 Sol — next-generation reasoning & website coding model'
  },
  {
    id: 'openai/gpt-6-luna:cloud',
    name: 'OpenAI GPT-6 Luna (Experiential Labs)',
    type: 'cloud',
    provider: 'Experiential Labs',
    description: 'OpenAI GPT-6 Luna — ultra-fast next-gen GPT-6 model'
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3 Chat',
    type: 'cloud',
    provider: 'DeepSeek',
    description: 'DeepSeek V3 — state-of-the-art open-source model, great for coding & web generation'
  },
  {
    id: 'deepseek/deepseek-reasoner',
    name: 'DeepSeek R1 Reasoner',
    type: 'cloud',
    provider: 'DeepSeek',
    description: 'DeepSeek R1 — powerful reasoning model, chain-of-thought web generation'
  }
];


// Rate limit for generation
const generateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute (relaxed for development)
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Reliable fallback model used whenever any local or cloud model is unavailable or fails.
// Favors Groq if GROQ_API_KEY is configured so users are never blocked by offline Ollama.
const LOCAL_FALLBACK_MODEL = process.env.GROQ_API_KEY
  ? 'groq/openai/gpt-oss-120b:cloud'
  : (process.env.OLLAMA_MODEL || 'qwen3:14b');

const MAX_PROMPT_LENGTH = 10_000;

function validateStreamPrompt(prompt, res) {
  if (!prompt || !String(prompt).trim()) {
    res.status(400).json({ error: 'Prompt is required' });
    return false;
  }
  if (String(prompt).length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `Prompt cannot exceed ${MAX_PROMPT_LENGTH.toLocaleString()} characters (about 2,000 words)` });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════
// SINGLE-MODEL GENERATION (existing)
// ═══════════════════════════════════════════

// Generate website (non-streaming)
router.post('/generate', generateLimiter, auth, validateGenerate, async (req, res) => {
  try {
    const { prompt, model } = req.body;
    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : process.env.OLLAMA_MODEL) || 'qwen3:14b';

    // Force fallback if no API key is present and using a cloud model
    const isCloud = aiService.isExternalCloudModel(modelToUse);
    if (isCloud && !hasValidApiKey(modelToUse)) {
      console.log(`Fallback: Switching from ${modelToUse} to ${LOCAL_FALLBACK_MODEL} (No Valid API Key)`);
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    console.log(`Generating with model: ${modelToUse}`);

    // Store the validated structured object in cache. Older cache entries that
    // only contain raw HTML are converted once and kept compatible.
    let site = aiService.getCached(prompt, modelToUse);
    const fromCache = !!site;
    let fallback = false;
    if (!site) {
      try {
        site = await aiService.generateSite(prompt, modelToUse);
      } catch (err) {
        console.warn(`Generation failed with ${modelToUse} (${err.message}); attempting fallback`);
        fallback = true;
        try {
          if (process.env.GROQ_API_KEY && modelToUse !== 'groq/openai/gpt-oss-120b:cloud') {
            console.warn(`[Fallback] Switching to Groq LPU (openai/gpt-oss-120b)`);
            modelToUse = 'groq/openai/gpt-oss-120b:cloud';
            site = await aiService.generateSite(prompt, modelToUse);
          } else if (modelToUse !== LOCAL_FALLBACK_MODEL) {
            console.warn(`[Fallback] Switching to ${LOCAL_FALLBACK_MODEL}`);
            modelToUse = LOCAL_FALLBACK_MODEL;
            site = await aiService.generateSite(prompt, modelToUse);
          } else {
            throw err;
          }
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }
      aiService.setCached(prompt, modelToUse, site);
    } else if (typeof site === 'string') {
      site = aiService.normalizeGeneratedSite(site);
      aiService.setCached(prompt, modelToUse, site);
    }

    // Increment generation count (only if not from cache and user exists)
    if (!fromCache && req.user?._id) {
      try {
        await User.findByIdAndUpdate(req.user._id, { $inc: { generationCount: 1 } });
      } catch (dbErr) {
        // Ignore DB errors - generation still succeeded
        console.log('Could not update generation count:', dbErr.message);
      }
    }

    res.json({ html: site.document, site, cached: fromCache, fallback });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: 'Generation failed: ' + err.message });
  }
});

// Stream generate (Server-Sent Events)
router.get('/stream-generate', generateLimiter, auth, async (req, res) => {
  try {
    const { prompt, model } = req.query;

    if (!validateStreamPrompt(prompt, res)) return;

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : process.env.OLLAMA_MODEL) || 'qwen3:14b';
    const isCloud = aiService.isExternalCloudModel(modelToUse);
    if (isCloud && !hasValidApiKey(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let fullHtml = '';
    let fallback = false;

    // Stream chunks, retrying with the local model if the cloud provider
    // rejects the request before any output has been produced.
    try {
      for await (const chunk of aiService.streamGenerate(prompt, modelToUse)) {
        fullHtml += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (err) {
      if (fullHtml) throw err;
      console.warn(`Stream failed with ${modelToUse} (${err.message}); falling back to reliable model`);
      fallback = true;
      if (process.env.GROQ_API_KEY && modelToUse !== 'groq/openai/gpt-oss-120b:cloud') {
        modelToUse = 'groq/openai/gpt-oss-120b:cloud';
      } else {
        modelToUse = LOCAL_FALLBACK_MODEL;
      }
      try {
        for await (const chunk of aiService.streamGenerate(prompt, modelToUse)) {
          fullHtml += chunk;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }

    // Update generation count
    if (req.user?._id) {
      try {
        await User.findByIdAndUpdate(req.user._id, { $inc: { generationCount: 1 } });
      } catch (dbErr) {
        console.log('Could not update generation count:', dbErr.message);
      }
    }

    const site = aiService.normalizeGeneratedSite(fullHtml);
    res.write(`data: ${JSON.stringify({ done: true, html: site.document, site, fallback })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Stream generation error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ═══════════════════════════════════════════
// PIPELINE GENERATION (2-stage)
// ═══════════════════════════════════════════

// Pipeline generate (non-streaming) — POST
router.post('/pipeline-generate', generateLimiter, auth, validateGenerate, async (req, res) => {
  try {
    const { prompt, mode } = req.body;
    const executionMode = mode === 'parallel' ? 'parallel' : 'sequential';
    console.log(`[Pipeline] Starting 2-stage generation for: "${prompt.substring(0, 60)}..." (Mode: ${executionMode})`);

    // Check pipeline cache
    let site = aiService.getCached(prompt, `pipeline-${executionMode}`);
    if (site) {
      if (typeof site === 'string') site = aiService.normalizeGeneratedSite(site);
      return res.json({ html: site.document, site, cached: true, fallback: false, stages: {}, skippedRefiner: false });
    }

    const result = await aiService.generatePipeline(prompt, executionMode);
    site = aiService.normalizeGeneratedSite(result.html);

    // Cache the result
    aiService.setCached(prompt, `pipeline-${executionMode}`, site);

    // Increment generation count
    if (req.user?._id) {
      try {
        await User.findByIdAndUpdate(req.user._id, { $inc: { generationCount: 1 } });
      } catch (dbErr) {
        console.log('Could not update generation count:', dbErr.message);
      }
    }

    res.json({
      html: site.document,
      site,
      cached: false,
      fallback: result.fallback,
      stages: result.stages
    });
  } catch (err) {
    console.error('[Pipeline] Error:', err);
    res.status(500).json({ error: 'Pipeline generation failed: ' + err.message });
  }
});

// Pipeline generate (SSE streaming with stage progress)
router.get('/stream-pipeline', generateLimiter, auth, async (req, res) => {
  try {
    const { prompt, mode } = req.query;
    const executionMode = mode === 'parallel' ? 'parallel' : 'sequential';

    if (!validateStreamPrompt(prompt, res)) return;

    console.log(`[Pipeline SSE] Starting for: "${prompt.substring(0, 60)}..." (Mode: ${executionMode})`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    for await (const event of aiService.streamGeneratePipeline(prompt, executionMode)) {
      const safeEvent = event.type === 'done'
        ? (() => {
            const site = aiService.normalizeGeneratedSite(event.html);
            return { ...event, html: site.document, site };
          })()
        : event;
      res.write(`data: ${JSON.stringify(safeEvent)}\n\n`);
    }

    // Update generation count
    if (req.user?._id) {
      try {
        await User.findByIdAndUpdate(req.user._id, { $inc: { generationCount: 1 } });
      } catch (dbErr) {
        console.log('Could not update generation count:', dbErr.message);
      }
    }

    res.end();
  } catch (err) {
    console.error('[Pipeline SSE] Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// ═══════════════════════════════════════════
// MODELS LIST
// ═══════════════════════════════════════════

// Get available models (dynamically from Ollama + NVIDIA NIM / Cloud options)
router.get('/models', auth, async (req, res) => {
  const localModels = await aiService.getOllamaModels();
  const availableStatic = STATIC_MODEL_OPTIONS.filter(m => hasValidApiKey(m.id));

  res.json({
    models: [
      ...localModels,
      ...availableStatic
    ],
    pipeline: {
      enabled: process.env.PIPELINE_ENABLED !== 'false',
      generator: process.env.PIPELINE_MODEL_GENERATOR || 'qwen3:14b',
      refiner: process.env.PIPELINE_MODEL_REFINER || 'qwen3:14b'
    }
  });
});

// Helper to format bytes
function formatBytes(bytes) {
  if (!bytes) return 'unknown size';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

// Apply an AI edit request to an existing generated site
router.post('/edit-site', generateLimiter, auth, async (req, res) => {
  try {
    const { html, instruction, model } = req.body;

    if (!html || !String(html).trim()) {
      return res.status(400).json({ error: 'Site HTML is required' });
    }
    if (!instruction || !String(instruction).trim()) {
      return res.status(400).json({ error: 'Edit instruction is required' });
    }
    if (String(instruction).length > 5000) {
      return res.status(400).json({ error: 'Edit instruction cannot exceed 5,000 characters' });
    }

    console.log(`[Edit] Edit requested for site (${html.length} chars) with model: ${model || 'default'}`);
    const editedHtml = await aiService.editWebsite(html, instruction, model);

    res.json({ html: editedHtml });
  } catch (err) {
    console.error('Edit site error:', err);
    res.status(500).json({ error: err.message || 'Failed to edit site' });
  }
});

// Standalone code refiner
router.post('/refine-code', generateLimiter, auth, async (req, res) => {
  try {
    const { code, instruction } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required for refinement' });
    }

    console.log(`[Pipeline] Standalone refine requested. Instruction: "${instruction || 'default'}"`);
    
    const refinedHtml = await aiService.runRefiner(code, instruction);
    const site = aiService.normalizeGeneratedSite(refinedHtml);
    
    res.json({ html: site.document, site });
  } catch (err) {
    console.error('Refinement error:', err);
    res.status(500).json({ error: err.message || 'Failed to refine code' });
  }
});

// ═══════════════════════════════════════════
// CONVERSATIONAL CHAT
// ═══════════════════════════════════════════

const Conversation = require('../models/Conversation');
const MAX_CONVERSATIONS_PER_USER = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;

// Send a chat message (non-streaming)
router.post('/chat', generateLimiter, auth, async (req, res) => {
  try {
    const { conversationId, message, model } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (String(message).length > 5000) {
      return res.status(400).json({ error: 'Message cannot exceed 5,000 characters' });
    }

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : LOCAL_FALLBACK_MODEL) || LOCAL_FALLBACK_MODEL;
    if (!hasValidApiKey(modelToUse) && aiService.isExternalCloudModel(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, owner: req.user._id });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      // Check limit
      const count = await Conversation.countDocuments({ owner: req.user._id });
      if (count >= MAX_CONVERSATIONS_PER_USER) {
        return res.status(429).json({ error: `You can have up to ${MAX_CONVERSATIONS_PER_USER} conversations.` });
      }
      conversation = new Conversation({
        owner: req.user._id,
        title: String(message).trim().substring(0, 80)
      });
    }

    // Add user message
    conversation.messages.push({ role: 'user', content: String(message).trim() });

    // Trim to max messages
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    }

    // Generate AI response
    const result = await aiService.chatGenerate(conversation.messages, modelToUse);

    // Add assistant message
    conversation.messages.push({
      role: 'assistant',
      content: result.reply,
      html: result.html || ''
    });

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      reply: result.reply,
      html: result.html || null,
      messageCount: conversation.messages.length
    });
  } catch (err) {
    console.error('[Chat] Error:', err);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

// Stream chat (SSE)
router.get('/stream-chat', generateLimiter, auth, async (req, res) => {
  try {
    const { conversationId, message, model } = req.query;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (String(message).length > 5000) {
      return res.status(400).json({ error: 'Message cannot exceed 5,000 characters' });
    }

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : LOCAL_FALLBACK_MODEL) || LOCAL_FALLBACK_MODEL;
    if (!hasValidApiKey(modelToUse) && aiService.isExternalCloudModel(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, owner: req.user._id });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      // Check limit like the non-streaming chat route
      const count = await Conversation.countDocuments({ owner: req.user._id });
      if (count >= MAX_CONVERSATIONS_PER_USER) {
        return res.status(429).json({ error: `You can have up to ${MAX_CONVERSATIONS_PER_USER} conversations.` });
      }
      conversation = new Conversation({
        owner: req.user._id,
        title: String(message).trim().substring(0, 80)
      });
    }

    conversation.messages.push({ role: 'user', content: String(message).trim() });

    // Trim to max messages like the non-streaming chat route
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send the conversation ID immediately so the client can track it
    res.write(`data: ${JSON.stringify({ type: 'init', conversationId: conversation._id })}\n\n`);

    let finalReply = '';
    let finalHtml = '';

    for await (const event of aiService.streamChatGenerate(conversation.messages, modelToUse)) {
      if (event.type === 'chunk') {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: event.content })}\n\n`);
      } else if (event.type === 'done') {
        finalReply = event.reply;
        finalHtml = event.html || '';
        res.write(`data: ${JSON.stringify({ type: 'done', reply: finalReply, html: finalHtml || null })}\n\n`);
      }
    }

    // Save to conversation
    conversation.messages.push({
      role: 'assistant',
      content: finalReply,
      html: finalHtml
    });
    await conversation.save();

    res.end();
  } catch (err) {
    console.error('[Chat Stream] Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// List user's conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({ owner: req.user._id })
      .sort({ updatedAt: -1 })
      .select('title messages updatedAt createdAt')
      .lean();

    res.json({
      conversations: conversations.map(c => ({
        id: c._id,
        title: c.title,
        messageCount: c.messages.length,
        lastMessage: c.messages.length > 0 ? c.messages[c.messages.length - 1].content.substring(0, 100) : '',
        updatedAt: c.updatedAt,
        createdAt: c.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// Get a full conversation
router.get('/conversations/:id', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      owner: req.user._id
    }).lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      conversation: {
        id: conversation._id,
        title: conversation.title,
        messages: conversation.messages,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

// Delete a conversation
router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    const result = await Conversation.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });
    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ═══════════════════════════════════════════
// AI ENHANCEMENT ENDPOINTS
// ═══════════════════════════════════════════

// Generate a design system
router.post('/generate/design-system', generateLimiter, auth, async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : LOCAL_FALLBACK_MODEL) || LOCAL_FALLBACK_MODEL;
    if (aiService.isExternalCloudModel(modelToUse) && !hasValidApiKey(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    const designSystem = await aiService.generateDesignSystem(prompt, modelToUse);
    res.json({ designSystem });
  } catch (err) {
    console.error('[Design System] Error:', err);
    res.status(500).json({ error: 'Failed to generate design system: ' + err.message });
  }
});

// Generate content/copy
router.post('/generate/content', generateLimiter, auth, async (req, res) => {
  try {
    const { prompt, type, model } = req.body;
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : LOCAL_FALLBACK_MODEL) || LOCAL_FALLBACK_MODEL;
    if (aiService.isExternalCloudModel(modelToUse) && !hasValidApiKey(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    const content = await aiService.generateContent(prompt, type || 'general', modelToUse);
    res.json({ content });
  } catch (err) {
    console.error('[Content] Error:', err);
    res.status(500).json({ error: 'Failed to generate content: ' + err.message });
  }
});

// Suggest improvements
router.post('/generate/suggest', generateLimiter, auth, async (req, res) => {
  try {
    const { html, model } = req.body;
    if (!html || !String(html).trim()) {
      return res.status(400).json({ error: 'HTML is required' });
    }

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : LOCAL_FALLBACK_MODEL) || LOCAL_FALLBACK_MODEL;
    if (aiService.isExternalCloudModel(modelToUse) && !hasValidApiKey(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    const suggestions = await aiService.suggestImprovements(html, modelToUse);
    res.json({ suggestions });
  } catch (err) {
    console.error('[Suggest] Error:', err);
    res.status(500).json({ error: 'Failed to generate suggestions: ' + err.message });
  }
});

// ═══════════════════════════════════════════
// FILE/IMAGE ANALYSIS ENDPOINT
// ═══════════════════════════════════════════

// Analyze uploaded files and generate website based on them
router.post('/analyze-and-generate', generateLimiter, auth, async (req, res) => {
  try {
    const { prompt, files, model } = req.body;

    if (!prompt && (!files || files.length === 0)) {
      return res.status(400).json({ error: 'Prompt or files are required' });
    }

    // Use explicit model, or user's cloud model preference, or local default
    let modelToUse = model || (req.user?.settings?.model?.includes('/') ? req.user.settings.model : LOCAL_FALLBACK_MODEL) || LOCAL_FALLBACK_MODEL;
    if (aiService.isExternalCloudModel(modelToUse) && !hasValidApiKey(modelToUse)) {
      modelToUse = LOCAL_FALLBACK_MODEL;
    }

    // Build enhanced prompt with file context
    let enhancedPrompt = prompt || '';

    if (files && files.length > 0) {
      const imageFiles = files.filter(f => f.type && f.type.startsWith('image/'));
      const textFiles = files.filter(f => f.type && !f.type.startsWith('image/'));

      // Add text file contents to prompt
      if (textFiles.length > 0) {
        enhancedPrompt += '\n\n[Attached files for reference:]';
        textFiles.forEach(f => {
          enhancedPrompt += `\n\n--- ${f.name} ---\n${(f.content || '').substring(0, 3000)}`;
        });
      }

      // Note about images (local models don't support vision)
      if (imageFiles.length > 0) {
        enhancedPrompt += `\n\n[User attached ${imageFiles.length} image(s): ${imageFiles.map(f => f.name).join(', ')}. `;
        enhancedPrompt += `Please describe what you see in these images and create a website based on that description. `;
        enhancedPrompt += `If the images show a specific layout, design, or content, recreate that in the website.]`;
      }
    }

    console.log(`[Analyze] Generating from prompt + ${files?.length || 0} files with model: ${modelToUse}`);

    const site = await aiService.generateSite(enhancedPrompt, modelToUse);

    res.json({ html: site.document, site, filesProcessed: files?.length || 0 });
  } catch (err) {
    console.error('[Analyze] Error:', err);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

module.exports = router;
