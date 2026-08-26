/**
 * Service-scoped routes (today's inventory unit).
 * Prefer nested /api/projects/:projectId/services/:serviceId when projectId is known.
 * These flat routes support legacy bookmarks (service UUID = old project UUID).
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { generateApiKey } from '../lib/apiKeys.js';
import { requireAuth } from '../middleware/auth.js';
import { accessibleService } from '../lib/orgs.js';

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

function serializeService(service) {
  return {
    id: service.id,
    name: service.name,
    projectId: service.projectId,
    projectName: service.project?.name,
    organizationId: service.project?.organizationId ?? service.project?.organization?.id,
    endpointLimit: service.endpointLimit,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    apiKeys: service.apiKeys,
    _count: service._count,
  };
}

router.get('/:serviceId', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ service: serializeService(service) });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ error: 'Failed to get service' });
  }
});

router.post('/:serviceId/api-keys', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const key = generateApiKey();
    const name = String(req.body?.name || 'default').trim() || 'default';

    const apiKey = await prisma.apiKey.create({
      data: {
        serviceId: service.id,
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

router.post('/:serviceId/api-keys/:keyId/revoke', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id: req.params.keyId, serviceId: service.id },
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
