const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  html: { type: String, required: true, maxlength: 2_000_000 },
  prompt: { type: String, default: '', maxlength: 10_000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  content: { type: String, default: '' },
  data: { type: String, default: '' },
}, { _id: false });

const projectSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  prompt: {
    type: String,
    default: '',
    maxlength: 10_000
  },
  html: {
    type: String,
    default: '',
    maxlength: 2_000_000
  },
  versions: {
    type: [versionSchema],
    default: []
  },
  tags: {
    type: [String],
    default: []
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  thumbnail: {
    type: String,
    default: '',
    maxlength: 500
  },
  attachments: {
    type: [attachmentSchema],
    default: []
  }
}, {
  timestamps: true
});

projectSchema.index({ owner: 1, updatedAt: -1 });
projectSchema.index({ owner: 1, name: 'text' });
projectSchema.index({ isPublic: 1, updatedAt: -1 });
projectSchema.index({ tags: 1 });

module.exports = mongoose.model('Project', projectSchema);
