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
 * Caller → endpoint topology for blast-radius UX (SF3).
 * GET /api/inventory/:serviceId/topology
 * Optional ?method=&pathTemplate= to filter edges for one endpoint.
 */
router.get('/:serviceId/topology', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const methodFilter =
      typeof req.query.method === 'string' ? req.query.method.toUpperCase() : null;
    const pathFilter =
      typeof req.query.pathTemplate === 'string' ? req.query.pathTemplate : null;

    const where = { serviceId: service.id };
    if (methodFilter) where.method = methodFilter;
    if (pathFilter) where.pathTemplate = pathFilter;

    const rows = await prisma.trafficEdge.findMany({
      where,
      orderBy: [{ hitCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: 500,
    });

    /** @type {Map<string, object>} */
    const callerMap = new Map();
    /** @type {Map<string, object>} */
    const endpointMap = new Map();
    const edges = [];

    for (const row of rows) {
      if (!callerMap.has(row.callerKey)) {
        callerMap.set(row.callerKey, {
          id: row.callerKey,
          type: 'caller',
          name: row.callerName,
          callerKey: row.callerKey,
          callerSource: row.callerSource,
          uaFamily: row.uaFamily,
          hitCount: 0,
        });
      }
      const callerNode = callerMap.get(row.callerKey);
      callerNode.hitCount += row.hitCount;

      const epId = `${row.method} ${row.pathTemplate}`;
      if (!endpointMap.has(epId)) {
        endpointMap.set(epId, {
          id: epId,
          type: 'endpoint',
          method: row.method,
          pathTemplate: row.pathTemplate,
          hitCount: 0,
        });
      }
      const epNode = endpointMap.get(epId);
      epNode.hitCount += row.hitCount;

      edges.push({
        from: row.callerKey,
        to: epId,
        callerKey: row.callerKey,
        callerName: row.callerName,
        callerSource: row.callerSource,
        uaFamily: row.uaFamily,
        method: row.method,
        pathTemplate: row.pathTemplate,
        hitCount: row.hitCount,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      });
    }

    const adjacency = [...callerMap.values()]
      .sort((a, b) => b.hitCount - a.hitCount)
      .map((caller) => ({
        ...caller,
        endpoints: edges
          .filter((e) => e.from === caller.id)
          .map((e) => ({
            method: e.method,
            pathTemplate: e.pathTemplate,
            hitCount: e.hitCount,
            lastSeenAt: e.lastSeenAt,
          })),
      }));

    res.json({
      serviceId: service.id,
      callers: adjacency,
      nodes: [...callerMap.values(), ...endpointMap.values()],
      edges,
    });
  } catch (error) {
    console.error('Get topology error:', error);
    res.status(500).json({ error: 'Failed to get topology' });
  }
});

export default router;
