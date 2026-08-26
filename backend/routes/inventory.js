import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { buildOpenApiDocument } from '../lib/openapi.js';
import { accessibleService } from '../lib/orgs.js';

const router = express.Router();

router.use(requireAuth);

/**
 * Inventory is scoped by Service (today's Project).
 * Paths keep :serviceId; legacy clients may still call this "projectId".
 */

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
    const safeName = String(service.name || 'api')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'api';

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


/**
 * SF2 — list inventory drift events for a service.
 * Query: unread=1 | unread=true → only unread; limit (default 50, max 200)
 * GET /api/inventory/:serviceId/events
 */
router.get('/:serviceId/events', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const unreadOnly =
      req.query.unread === '1' ||
      String(req.query.unread || '').toLowerCase() === 'true';
    const limitRaw = Number(req.query.limit);
    const take = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
      : 50;

    const where = {
      serviceId: service.id,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [events, unreadCount] = await Promise.all([
      prisma.inventoryEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          endpoint: {
            select: { id: true, method: true, pathTemplate: true },
          },
        },
      }),
      prisma.inventoryEvent.count({
        where: { serviceId: service.id, readAt: null },
      }),
    ]);

    res.json({ events, unreadCount });
  } catch (error) {
    console.error('List inventory events error:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

/**
 * Mark one event read.
 * POST /api/inventory/:serviceId/events/:eventId/read
 */
router.post('/:serviceId/events/:eventId/read', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const existing = await prisma.inventoryEvent.findFirst({
      where: { id: req.params.eventId, serviceId: service.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = existing.readAt
      ? existing
      : await prisma.inventoryEvent.update({
          where: { id: existing.id },
          data: { readAt: new Date() },
        });

    res.json({ event });
  } catch (error) {
    console.error('Mark event read error:', error);
    res.status(500).json({ error: 'Failed to mark event read' });
  }
});

/**
 * Mark all unread events for the service as read.
 * POST /api/inventory/:serviceId/events/read-all
 */
router.post('/:serviceId/events/read-all', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const result = await prisma.inventoryEvent.updateMany({
      where: { serviceId: service.id, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ updated: result.count });
  } catch (error) {
    console.error('Mark all events read error:', error);
    res.status(500).json({ error: 'Failed to mark events read' });
  }
});

export default router;
