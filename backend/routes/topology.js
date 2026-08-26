import express from 'express';
import { validateTopologyBaseline } from '@apiglimpse/shared';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { accessibleProject } from '../lib/orgs.js';
import {
  baselineForStorage,
  compareProjectTopology,
  loadObservedGraph,
  recordTopologyDrift,
} from '../lib/topology.js';

const router = express.Router();

router.use(requireAuth);

async function loadProjectTopology(projectId, userId) {
  const accessible = await accessibleProject(projectId, userId);
  if (!accessible) return null;

  return prisma.project.findUnique({
    where: { id: accessible.id },
    select: {
      id: true,
      webhookUrl: true,
      topologyBaseline: true,
      topologyBaselineUpdatedAt: true,
    },
  });
}

/**
 * GET /api/projects/:projectId/topology/baseline
 */
router.get('/:projectId/topology/baseline', async (req, res) => {
  try {
    const project = await loadProjectTopology(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      baseline: project.topologyBaseline ?? null,
      updatedAt: project.topologyBaselineUpdatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Get topology baseline error:', error);
    res.status(500).json({ error: 'Failed to load topology baseline' });
  }
});

/**
 * PUT /api/projects/:projectId/topology/baseline
 * Body: { baseline: <topology-baseline.v1> }
 */
router.put('/:projectId/topology/baseline', async (req, res) => {
  try {
    const project = await loadProjectTopology(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const raw = req.body?.baseline;
    const validated = validateTopologyBaseline(raw);
    if (!validated.ok) {
      return res.status(400).json({ error: 'Invalid baseline', details: validated.errors });
    }

    const toStore = baselineForStorage(validated.baseline);
    const now = new Date();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        topologyBaseline: toStore,
        topologyBaselineUpdatedAt: now,
      },
      select: {
        topologyBaseline: true,
        topologyBaselineUpdatedAt: true,
      },
    });

    res.json({
      baseline: updated.topologyBaseline,
      updatedAt: updated.topologyBaselineUpdatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Update topology baseline error:', error);
    res.status(500).json({ error: 'Failed to save topology baseline' });
  }
});

/**
 * GET /api/projects/:projectId/topology/observed
 */
router.get('/:projectId/topology/observed', async (req, res) => {
  try {
    const project = await loadProjectTopology(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const observed = await loadObservedGraph(prisma, project.id);
    res.json(observed);
  } catch (error) {
    console.error('Get observed topology error:', error);
    res.status(500).json({ error: 'Failed to load observed topology' });
  }
});

/**
 * GET /api/projects/:projectId/topology/compare?recordDrift=1
 */
router.get('/:projectId/topology/compare', async (req, res) => {
  try {
    const project = await loadProjectTopology(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.topologyBaseline) {
      return res.status(404).json({ error: 'No topology baseline configured' });
    }

    const compare = await compareProjectTopology(prisma, project.id, project.topologyBaseline);
    const recordDrift = String(req.query.recordDrift || '') === '1';

    if (recordDrift) {
      await recordTopologyDrift(prisma, project.id, compare, {
        webhookUrl: project.webhookUrl,
      });
    }

    res.json(compare);
  } catch (error) {
    console.error('Compare topology error:', error);
    res.status(500).json({ error: 'Failed to compare topology' });
  }
});

/**
 * GET /api/projects/:projectId/topology/events
 */
router.get('/:projectId/topology/events', async (req, res) => {
  try {
    const project = await loadProjectTopology(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const unreadOnly = String(req.query.unread || '') === '1';

    const events = await prisma.projectTopologyEvent.findMany({
      where: {
        projectId: project.id,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.projectTopologyEvent.count({
      where: { projectId: project.id, readAt: null },
    });

    res.json({ events, unreadCount });
  } catch (error) {
    console.error('List topology events error:', error);
    res.status(500).json({ error: 'Failed to list topology events' });
  }
});

/**
 * POST /api/projects/:projectId/topology/events/read
 * Body: { ids?: string[] } — omit ids to mark all unread as read.
 */
router.post('/:projectId/topology/events/read', async (req, res) => {
  try {
    const project = await loadProjectTopology(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const now = new Date();

    if (ids.length === 0) {
      await prisma.projectTopologyEvent.updateMany({
        where: { projectId: project.id, readAt: null },
        data: { readAt: now },
      });
    } else {
      await prisma.projectTopologyEvent.updateMany({
        where: { projectId: project.id, id: { in: ids }, readAt: null },
        data: { readAt: now },
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Mark topology events read error:', error);
    res.status(500).json({ error: 'Failed to mark topology events read' });
  }
});

export default router;
