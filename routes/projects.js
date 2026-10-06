const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const { auth } = require('../middleware/auth');
const { requireDb } = require('../middleware/db');
const { escapeRegex } = require('../middleware/escapeRegex');

const MAX_PROJECTS_PER_USER = 100;
const MAX_VERSIONS_PER_PROJECT = 20;

function asProjectSummary(project) {
  return {
    id: project._id,
    name: project.name,
    prompt: project.prompt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    versionCount: project.versions.length,
    attachmentCount: project.attachments?.length || 0
  };
}

function validateProjectInput(input, { requireName = false } = {}) {
  const errors = [];
  if (requireName && (!input.name || !String(input.name).trim())) {
    errors.push('Project name is required');
  }
  if (input.name !== undefined && String(input.name).trim().length > 80) {
    errors.push('Project name cannot exceed 80 characters');
  }
  if (input.prompt !== undefined && String(input.prompt).length > 100_000) {
    errors.push('Prompt cannot exceed 100,000 characters');
  }
  if (input.html !== undefined && String(input.html).length > 2_000_000) {
    errors.push('Generated website is too large to save');
  }
  return errors;
}

router.use(auth, requireDb);

// Project list deliberately omits generated HTML so the dashboard stays fast.
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { owner: req.user._id };

    if (search && search.trim()) {
      filter.name = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const clampedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (pageNum - 1) * clampedLimit;

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(clampedLimit)
        // Only field names are needed for counts — never ship full HTML/attachment
        // payloads in the dashboard list.
        .select('name prompt createdAt updatedAt versions.prompt versions.createdAt tags attachments.name')
        .lean(),
      Project.countDocuments(filter)
    ]);

    res.json({
      projects: projects.map(asProjectSummary),
      pagination: {
        page: pageNum,
        limit: clampedLimit,
        total,
        pages: Math.ceil(total / clampedLimit)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const errors = validateProjectInput(req.body, { requireName: true });
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const projectCount = await Project.countDocuments({ owner: req.user._id });
    if (projectCount >= MAX_PROJECTS_PER_USER) {
      return res.status(429).json({ error: `You can save up to ${MAX_PROJECTS_PER_USER} projects.` });
    }

    const attachments = Array.isArray(req.body.attachments)
      ? req.body.attachments.map(a => ({
          name: String(a.name || '').trim(),
          type: String(a.type || '').trim(),
          content: String(a.content || ''),
          data: String(a.data || '')
        })).filter(a => a.name)
      : [];

    const project = await Project.create({
      owner: req.user._id,
      name: String(req.body.name).trim(),
      prompt: String(req.body.prompt || '').trim(),
      html: String(req.body.html || ''),
      attachments
    });
    res.status(201).json({ project: asProjectSummary(project) });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await Project.deleteMany({ owner: req.user._id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId', async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      project: {
        ...asProjectSummary(project),
        html: project.html,
        versions: project.versions.map((version, index) => ({
          index,
          prompt: version.prompt,
          createdAt: version.createdAt
        })),
        attachments: project.attachments || []
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:projectId', async (req, res, next) => {
  try {
    const errors = validateProjectInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const nextHtml = req.body.html === undefined ? project.html : String(req.body.html);
    const nextPrompt = req.body.prompt === undefined ? project.prompt : String(req.body.prompt).trim();
    const htmlChanged = req.body.html !== undefined && nextHtml !== project.html;

    // Preserve a compact, recoverable edit history whenever generated code changes.
    if (htmlChanged && project.html) {
      project.versions.unshift({ html: project.html, prompt: project.prompt });
      project.versions = project.versions.slice(0, MAX_VERSIONS_PER_PROJECT);
    }

    if (req.body.name !== undefined) project.name = String(req.body.name).trim();
    project.prompt = nextPrompt;
    project.html = nextHtml;

    // Handle attachments update
    if (Array.isArray(req.body.attachments)) {
      project.attachments = req.body.attachments.map(a => ({
        name: String(a.name || '').trim(),
        type: String(a.type || '').trim(),
        content: String(a.content || ''),
        data: String(a.data || '')
      })).filter(a => a.name);
    }

    await project.save();

    res.json({ project: asProjectSummary(project) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:projectId', async (req, res, next) => {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.projectId, owner: req.user._id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Get a specific version's HTML
router.get('/:projectId/versions/:index', async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const versionIndex = parseInt(req.params.index);
    if (isNaN(versionIndex) || versionIndex < 0 || versionIndex >= project.versions.length) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const version = project.versions[versionIndex];
    res.json({
      version: {
        index: versionIndex,
        html: version.html,
        prompt: version.prompt,
        createdAt: version.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Restore a previous version
router.post('/:projectId/restore/:versionIndex', async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const versionIndex = parseInt(req.params.versionIndex);
    if (isNaN(versionIndex) || versionIndex < 0 || versionIndex >= project.versions.length) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const version = project.versions[versionIndex];

    // Save current state as a new version before restoring
    if (project.html) {
      project.versions.unshift({ html: project.html, prompt: project.prompt });
      project.versions = project.versions.slice(0, MAX_VERSIONS_PER_PROJECT);
    }

    // Restore
    project.html = version.html;
    project.prompt = version.prompt;
    await project.save();

    res.json({ project: asProjectSummary(project), restoredFrom: versionIndex });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
