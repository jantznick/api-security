import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { buildEvidencePack } from '../lib/evidence.js';
import { buildOpenApiDocument } from '../lib/openapi.js';
import { accessibleService } from '../lib/orgs.js';

const router = express.Router();

router.use(requireAuth);

/**
 * Inventory is scoped by Service (today's Project).
 * Paths keep :serviceId; legacy clients may still call this "projectId".
 */

function safeFilenameBase(name) {
  return (
    String(name || 'api')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'api'
  );
}

/**
 * Export discovered inventory as OpenAPI 3.0 JSON.
 * Auth: session + org membership via service.
 */
router.get('/:serviceId/openapi', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: service.id },
      orderBy: [{ pathTemplate: 'asc' }, { method: 'asc' }],
    });

    const document = buildOpenApiDocument({
      project: service,
      service,
      endpoints,
    });
    const safeName = safeFilenameBase(service.name);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}-openapi.json"`,
    );
    res.json(document);
  } catch (error) {
    console.error('OpenAPI export error:', error);
    res.status(500).json({ error: 'Failed to export OpenAPI' });
  }
});

/**
 * Download a dated evidence pack (inventory + signals + OpenAPI + optional posture).
 * Auth: session + org membership via service (same as other inventory routes).
 */
router.get('/:serviceId/evidence', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: service.id },
      orderBy: [{ pathTemplate: 'asc' }, { method: 'asc' }],
      include: {
        signals: { orderBy: [{ severity: 'asc' }, { fieldPath: 'asc' }] },
      },
    });

    const pack = await buildEvidencePack({ service, endpoints });
    const safeName = safeFilenameBase(service.name);
    const day = String(pack.generatedAt || '').slice(0, 10) || 'export';

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}-evidence-${day}.json"`,
    );
    res.json(pack);
  } catch (error) {
    console.error('Evidence pack export error:', error);
    res.status(500).json({ error: 'Failed to export evidence pack' });
  }
});

router.get('/:serviceId/endpoints', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: service.id },
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

router.get('/:serviceId/endpoints/:endpointId', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const endpoint = await prisma.endpoint.findFirst({
      where: { id: req.params.endpointId, serviceId: service.id },
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
