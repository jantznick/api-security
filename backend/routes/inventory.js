import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { buildEvidencePack } from '../lib/evidence.js';
import { buildOpenApiDocument } from '../lib/openapi.js';
import { accessibleService } from '../lib/orgs.js';
import { scoreServicePosture } from '../lib/risk.js';
import { buildPolicySuggestions } from '../lib/policySuggestions.js';

const router = express.Router();

router.use(requireAuth);

function safeFilenameBase(name) {
  return (
    String(name || 'api')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'api'
  );
}

/** SF1 — light posture (kept; deeper UX deferred per Nick). */
router.get('/:serviceId/posture', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: service.id },
      orderBy: [{ pathTemplate: 'asc' }, { method: 'asc' }],
      include: {
        signals: {
          where: { type: 'sensitive_field' },
          select: { type: true, category: true, fieldPath: true, severity: true },
        },
      },
    });
    res.json(scoreServicePosture(endpoints));
  } catch (error) {
    console.error('Posture error:', error);
    res.status(500).json({ error: 'Failed to compute posture' });
  }
});

/** SF7 — detect-only policy suggestions */
router.get('/:serviceId/policy-suggestions', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: service.id },
      include: {
        signals: { where: { type: 'sensitive_field' } },
      },
    });
    res.json(buildPolicySuggestions(endpoints));
  } catch (error) {
    console.error('Policy suggestions error:', error);
    res.status(500).json({ error: 'Failed to build suggestions' });
  }
});

/** SF2 — drift events */
router.get('/:serviceId/events', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const unreadOnly = String(req.query.unread || '') === '1';

    const events = await prisma.inventoryEvent.findMany({
      where: {
        serviceId: service.id,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unreadCount = await prisma.inventoryEvent.count({
      where: { serviceId: service.id, readAt: null },
    });
    res.json({ events, unreadCount });
  } catch (error) {
    console.error('List events error:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

router.post('/:serviceId/events/read', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const now = new Date();
    if (ids.length === 0) {
      await prisma.inventoryEvent.updateMany({
        where: { serviceId: service.id, readAt: null },
        data: { readAt: now },
      });
    } else {
      await prisma.inventoryEvent.updateMany({
        where: { serviceId: service.id, id: { in: ids }, readAt: null },
        data: { readAt: now },
      });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark events read error:', error);
    res.status(500).json({ error: 'Failed to mark events read' });
  }
});

/** SF3 — caller topology (explicit service names only) */
router.get('/:serviceId/topology', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const edges = await prisma.trafficEdge.findMany({
      where: { serviceId: service.id },
      orderBy: [{ hitCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: 500,
    });

    const callers = new Map();
    for (const e of edges) {
      const prev = callers.get(e.callerKey) || {
        key: e.callerKey,
        label: e.callerLabel,
        hitCount: 0,
        endpoints: [],
      };
      prev.hitCount += e.hitCount;
      prev.endpoints.push({
        method: e.method,
        pathTemplate: e.pathTemplate,
        hitCount: e.hitCount,
        lastSeenAt: e.lastSeenAt,
      });
      callers.set(e.callerKey, prev);
    }

    res.json({
      edges,
      callers: [...callers.values()],
      hint: 'Set API_SENSOR_SERVICE_NAME or X-Service-Name on callers for topology edges.',
    });
  } catch (error) {
    console.error('Topology error:', error);
    res.status(500).json({ error: 'Failed to load topology' });
  }
});

router.get('/:serviceId/openapi', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

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

router.get('/:serviceId/evidence', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

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
    if (!service) return res.status(404).json({ error: 'Service not found' });

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
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const endpoint = await prisma.endpoint.findFirst({
      where: { id: req.params.endpointId, serviceId: service.id },
      include: {
        signals: { orderBy: [{ severity: 'asc' }, { fieldPath: 'asc' }] },
      },
    });

    if (!endpoint) return res.status(404).json({ error: 'Endpoint not found' });
    res.json({ endpoint });
  } catch (error) {
    console.error('Get endpoint error:', error);
    res.status(500).json({ error: 'Failed to get endpoint' });
  }
});

export default router;
