const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 50_000
  },
  html: {
    type: String,
    default: '',
    maxlength: 2_000_000
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null
  },
  title: {
    type: String,
    default: 'New Conversation',
    trim: true,
    maxlength: 120
  },
  messages: {
    type: [messageSchema],
    default: []
  }
}, {
  timestamps: true
});

conversationSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
