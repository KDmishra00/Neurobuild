const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: ['generate', 'save_project', 'load_project', 'export', 'use_template', 'use_component', 'chat_message', 'refine'],
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

analyticsSchema.index({ userId: 1, action: 1, timestamp: -1 });
analyticsSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Analytics', analyticsSchema);
