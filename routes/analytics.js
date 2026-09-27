const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');
const Project = require('../models/Project');
const { auth } = require('../middleware/auth');
const { requireDb } = require('../middleware/db');

router.use(auth, requireDb);

/**
 * Track an analytics event. Called internally by other routes
 * or directly from the frontend for client-side events.
 */
router.post('/track', async (req, res, next) => {
  try {
    const { action, metadata } = req.body;
    const validActions = ['generate', 'save_project', 'load_project', 'export', 'use_template', 'use_component', 'chat_message', 'refine'];

    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    await Analytics.create({
      userId: req.user._id,
      action,
      metadata: metadata || {}
    });

    res.status(201).json({ tracked: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Get aggregated dashboard stats for the logged-in user.
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [
      totalGenerations,
      totalProjects,
      totalExports,
      recentActivity,
      actionBreakdown
    ] = await Promise.all([
      // Total generations
      Analytics.countDocuments({ userId, action: 'generate' }),
      // Total projects
      Project.countDocuments({ owner: userId }),
      // Total exports
      Analytics.countDocuments({ userId, action: 'export' }),
      // Recent activity (last 10 events)
      Analytics.find({ userId })
        .sort({ timestamp: -1 })
        .limit(10)
        .select('action metadata timestamp')
        .lean(),
      // Action breakdown
      Analytics.aggregate([
        { $match: { userId } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      stats: {
        totalGenerations,
        totalProjects,
        totalExports,
        generationCount: req.user.generationCount || 0
      },
      recentActivity,
      actionBreakdown: actionBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get generation usage over time (last 30 days).
 */
router.get('/usage', async (req, res, next) => {
  try {
    const userId = req.user._id;
    const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 90));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usage = await Analytics.aggregate([
      {
        $match: {
          userId,
          action: 'generate',
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing days with 0
    const result = [];
    const current = new Date(startDate);
    const today = new Date();
    const usageMap = new Map(usage.map(u => [u._id, u.count]));

    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      result.push({ date: dateStr, count: usageMap.get(dateStr) || 0 });
      current.setDate(current.getDate() + 1);
    }

    res.json({ usage: result, days });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to track an event from other routes.
 * Import and call: trackEvent(userId, 'generate', { model: 'qwen3:4b' })
 */
async function trackEvent(userId, action, metadata = {}) {
  try {
    await Analytics.create({ userId, action, metadata });
  } catch (err) {
    console.error('[Analytics] Track error:', err.message);
  }
}

module.exports = router;
module.exports.trackEvent = trackEvent;
