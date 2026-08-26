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
    webhookUrl: service.webhookUrl ?? null,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    apiKeys: service.apiKeys,
    _count: service._count,
  };
}

/** Allow http(s) URLs only; empty clears. */
function normalizeWebhookUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'webhookUrl must be a valid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'webhookUrl must use http or https' };
  }
  return { value: trimmed };
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

/**
 * PATCH /api/services/:serviceId — { webhookUrl?: string | null }
 */
router.patch('/:serviceId', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'webhookUrl')) {
      const normalized = normalizeWebhookUrl(req.body.webhookUrl);
      if (normalized?.error) {
        return res.status(400).json({ error: normalized.error });
      }
      data.webhookUrl = normalized === undefined ? undefined : normalized.value ?? null;
    }

    if (Object.keys(data).length === 0) {
      return res.json({ service: serializeService(service) });
    }

    const updated = await prisma.service.update({
      where: { id: service.id },
      data,
      include: {
        apiKeys: {
          orderBy: { createdAt: 'desc' },
          select: apiKeySelect,
        },
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: { select: { id: true, name: true, slug: true, isPersonal: true } },
          },
        },
        _count: { select: { endpoints: true } },
      },
    });

    res.json({ service: serializeService(updated) });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service' });
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
