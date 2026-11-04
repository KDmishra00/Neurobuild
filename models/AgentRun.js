/**
 * AgentRun — Module 6: Collaborative Agentic AI
 *
 * Persists each collaborative agent run to MongoDB so users can
 * view their enhancement history and replay what agents produced.
 * Linked to both the user and their project.
 */
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  id:          { type: String, required: true },
  agentName:   { type: String, required: true },
  description: { type: String, default: '' },
  status:      { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
  result:      { type: String, default: '' }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  id:        { type: Number },
  timestamp: { type: String },
  from:      { type: String },
  to:        { type: String },
  topic:     { type: String },
  payload:   { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const agentRunSchema = new mongoose.Schema({
  // Ownership
  owner:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },

  // Input
  originalPrompt: { type: String, default: '' },
  baseHtml:       { type: String, default: '', maxlength: 2_000_000 },

  // Plan
  domain:      { type: String, default: '' },
  domainType:  { type: String, default: '' },
  needsBackend:{ type: Boolean, default: true },
  features:    { type: [String], default: [] },

  // Tasks (from all agents)
  tasks: { type: [taskSchema], default: [] },

  // Contracts (the shared JSON)
  dbSchema: {
    tables: { type: mongoose.Schema.Types.Mixed, default: [] }
  },
  apiContract: {
    endpoints: { type: mongoose.Schema.Types.Mixed, default: [] }
  },
  schemaCode:  { type: String, default: '', maxlength: 100_000 },
  backendCode: { type: String, default: '', maxlength: 100_000 },
  seedData:    { type: mongoose.Schema.Types.Mixed, default: {} },

  // Output
  enhancedHtml: { type: String, default: '', maxlength: 2_000_000 },

  // Review
  reviewPassed: { type: Boolean, default: false },
  reviewIssues: { type: mongoose.Schema.Types.Mixed, default: [] },
  revisionCount:{ type: mongoose.Schema.Types.Mixed, default: {} },

  // Message log (inter-agent communication)
  messageLog: { type: [messageSchema], default: [] },

  // Run status
  status:    { type: String, enum: ['running', 'complete', 'failed'], default: 'running', index: true },
  error:     { type: String, default: '' },
  durationMs:{ type: Number, default: 0 }
}, {
  timestamps: true
});

agentRunSchema.index({ owner: 1, createdAt: -1 });
agentRunSchema.index({ owner: 1, projectId: 1 });

module.exports = mongoose.model('AgentRun', agentRunSchema);

