import express from 'express';
import prisma from '../lib/prisma.js';
import { generateApiKey } from '../lib/apiKeys.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveEndpointLimit } from '../lib/plans.js';

const router = express.Router();

router.use(requireAuth);

const apiKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
};

async function ownedProject(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
}

router.get('/', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.session.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: apiKeySelect,
        },
        _count: { select: { endpoints: true } },
      },
    });
    res.json({ projects });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim() || 'Default project';
    const key = generateApiKey();

    const owner = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { planSlug: true },
    });
    const endpointLimit = await resolveEndpointLimit(owner?.planSlug || 'free');

    const project = await prisma.project.create({
      data: {
        name,
        ownerId: req.session.userId,
        endpointLimit,
        apiKeys: {
          create: {
            name: 'default',
            keyHash: key.hash,
            keyPrefix: key.prefix,
          },
        },
      },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: apiKeySelect,
        },
      },
    });

    res.status(201).json({
      project,
      /** Shown once — store in agent / middleware env */
      apiKey: key.raw,
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/:projectId', async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, ownerId: req.session.userId },
      include: {
        apiKeys: {
          orderBy: { createdAt: 'desc' },
          select: apiKeySelect,
        },
        _count: { select: { endpoints: true } },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

router.post('/:projectId/api-keys', async (req, res) => {
  try {
    const project = await ownedProject(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const key = generateApiKey();
    const name = String(req.body?.name || 'default').trim() || 'default';

    const apiKey = await prisma.apiKey.create({
      data: {
        projectId: project.id,
        name,
        keyHash: key.hash,
        keyPrefix: key.prefix,
      },
      select: apiKeySelect,
    });

    res.status(201).json({ apiKey, rawKey: key.raw });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.post('/:projectId/api-keys/:keyId/revoke', async (req, res) => {
  try {
    const project = await ownedProject(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id: req.params.keyId, projectId: project.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }
    if (existing.revokedAt) {
      return res.json({
        apiKey: {
          id: existing.id,
          name: existing.name,
          keyPrefix: existing.keyPrefix,
          createdAt: existing.createdAt,
          lastUsedAt: existing.lastUsedAt,
          revokedAt: existing.revokedAt,
        },
      });
    }

    const apiKey = await prisma.apiKey.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
      select: apiKeySelect,
    });

    res.json({ apiKey });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
