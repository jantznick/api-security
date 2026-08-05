import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

async function ownedProject(userId, projectId) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
}

router.get('/:projectId/endpoints', async (req, res) => {
  try {
    const project = await ownedProject(req.session.userId, req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const endpoints = await prisma.endpoint.findMany({
      where: { projectId: project.id },
      orderBy: { lastSeenAt: 'desc' },
      include: {
        _count: { select: { signals: true } },
      },
    });

    res.json({ endpoints });
  } catch (error) {
    console.error('List endpoints error:', error);
    res.status(500).json({ error: 'Failed to list endpoints' });
  }
});

router.get('/:projectId/endpoints/:endpointId', async (req, res) => {
  try {
    const project = await ownedProject(req.session.userId, req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const endpoint = await prisma.endpoint.findFirst({
      where: { id: req.params.endpointId, projectId: project.id },
      include: {
        signals: { orderBy: [{ severity: 'asc' }, { fieldPath: 'asc' }] },
      },
    });

    if (!endpoint) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    res.json({ endpoint });
  } catch (error) {
    console.error('Get endpoint error:', error);
    res.status(500).json({ error: 'Failed to get endpoint' });
  }
});

export default router;
