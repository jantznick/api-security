import express from 'express';
import prisma from '../lib/prisma.js';
import { requireApiKey } from '../middleware/apiKey.js';

const router = express.Router();

router.use(requireApiKey);

/**
 * Prefer per-service limit (Stripe → Service.endpointLimit).
 * Fall back to env ENDPOINT_LIMIT. 0 / null / unset = unlimited.
 */
function resolveEndpointLimit(service) {
  const fromService = service?.endpointLimit;
  if (fromService !== undefined && fromService !== null) {
    const n = Number(fromService);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return 0;
  }
  const raw = process.env.ENDPOINT_LIMIT;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Idempotent upsert of endpoint inventory + signals (+ optional traffic edges).
 * Body: {
 *   endpoints: [ ... ],
 *   edges?: [ { callerKey, callerName, callerSource, uaFamily, method, pathTemplate,
 *     hitCount, firstSeenAt, lastSeenAt } ]
 * }
 */
router.post('/upsert', async (req, res) => {
  try {
    const service = req.service || req.project;
    const serviceId = service.id;
    const endpoints = Array.isArray(req.body?.endpoints) ? req.body.endpoints : [];
    const edges = Array.isArray(req.body?.edges) ? req.body.edges : [];
    const limit = resolveEndpointLimit(service);

    if (endpoints.length === 0 && edges.length === 0) {
      res.json({ upserted: 0, skippedNew: 0, edgesUpserted: 0 });
      return;
    }

    let upserted = 0;
    let skippedNew = 0;
    let edgesUpserted = 0;
    let currentCount = null;

    async function loadCount() {
      if (currentCount === null) {
        currentCount = await prisma.endpoint.count({ where: { serviceId } });
      }
      return currentCount;
    }

    for (const delta of endpoints) {
      const method = String(delta.method || '').toUpperCase();
      const pathTemplate = String(delta.pathTemplate || '');
      if (!method || !pathTemplate) continue;

      const existing = await prisma.endpoint.findUnique({
        where: {
          serviceId_method_pathTemplate: { serviceId, method, pathTemplate },
        },
      });

      if (!existing && limit > 0) {
        const count = await loadCount();
        if (count >= limit) {
          skippedNew += 1;
          continue;
        }
      }

      const lastSeenAt = delta.lastSeenAt ? new Date(delta.lastSeenAt) : new Date();
      const firstSeenAt = delta.firstSeenAt ? new Date(delta.firstSeenAt) : lastSeenAt;
      const hitInc = Number(delta.hitCount) || 1;

      const mergedStatus = {
        ...((existing?.statusCodes && typeof existing.statusCodes === 'object'
          ? existing.statusCodes
          : {}) || {}),
      };
      for (const [code, count] of Object.entries(delta.statusCodes || {})) {
        mergedStatus[code] = (mergedStatus[code] || 0) + Number(count || 0);
      }

      const prevAuth = Array.isArray(existing?.authModes) ? existing.authModes : [];
      const authModes = [...new Set([...prevAuth, ...(delta.authModes || [])])];

      const prevCt = Array.isArray(existing?.contentTypes) ? existing.contentTypes : [];
      const contentTypes = [...new Set([...prevCt, ...(delta.contentTypes || [])])];

      const requestSchema =
        delta.requestSchema !== undefined && delta.requestSchema !== null
          ? delta.requestSchema
          : existing?.requestSchema ?? null;
      const responseSchema =
        delta.responseSchema !== undefined && delta.responseSchema !== null
          ? delta.responseSchema
          : existing?.responseSchema ?? null;

      const endpoint = await prisma.endpoint.upsert({
        where: {
          serviceId_method_pathTemplate: { serviceId, method, pathTemplate },
        },
        create: {
          serviceId,
          method,
          pathTemplate,
          hitCount: hitInc,
          authModes,
          statusCodes: mergedStatus,
          contentTypes,
          requestSchema,
          responseSchema,
          firstSeenAt,
          lastSeenAt,
        },
        update: {
          hitCount: { increment: hitInc },
          authModes,
          statusCodes: mergedStatus,
          contentTypes,
          requestSchema,
          responseSchema,
          lastSeenAt,
        },
      });

      if (!existing) {
        currentCount = (await loadCount()) + 1;
      }

      for (const signal of delta.signals || []) {
        const type = String(signal.type || 'sensitive_field');
        const fieldPath = String(signal.fieldPath || '');
        const category = String(signal.category || 'unknown');
        if (!fieldPath) continue;

        await prisma.signal.upsert({
          where: {
            endpointId_type_fieldPath_category: {
              endpointId: endpoint.id,
              type,
              fieldPath,
              category,
            },
          },
          create: {
            endpointId: endpoint.id,
            type,
            fieldPath,
            category,
            severity: String(signal.severity || 'info'),
            lastSeenAt,
            metadata: signal.metadata ?? undefined,
          },
          update: {
            severity: String(signal.severity || 'info'),
            lastSeenAt,
            metadata: signal.metadata ?? undefined,
          },
        });
      }

      upserted += 1;
    }

    for (const edge of edges) {
      const callerKey = String(edge.callerKey || '').slice(0, 160);
      const method = String(edge.method || '').toUpperCase();
      const pathTemplate = String(edge.pathTemplate || '');
      if (!callerKey || !method || !pathTemplate) continue;

      const hitInc = Number(edge.hitCount) || 1;
      const lastSeenAt = edge.lastSeenAt ? new Date(edge.lastSeenAt) : new Date();
      const firstSeenAt = edge.firstSeenAt ? new Date(edge.firstSeenAt) : lastSeenAt;
      const callerName = String(edge.callerName || callerKey).slice(0, 128);
      const callerSource =
        edge.callerSource === 'header' || edge.callerSource === 'config'
          ? edge.callerSource
          : null;
      const uaFamily = ['browser', 'sdk', 'curl', 'unknown'].includes(edge.uaFamily)
        ? edge.uaFamily
        : 'unknown';

      await prisma.trafficEdge.upsert({
        where: {
          serviceId_callerKey_method_pathTemplate: {
            serviceId,
            callerKey,
            method,
            pathTemplate,
          },
        },
        create: {
          serviceId,
          callerKey,
          callerName,
          callerSource,
          uaFamily,
          method,
          pathTemplate,
          hitCount: hitInc,
          firstSeenAt,
          lastSeenAt,
        },
        update: {
          hitCount: { increment: hitInc },
          callerName,
          callerSource,
          uaFamily,
          lastSeenAt,
        },
      });
      edgesUpserted += 1;
    }

    const status = skippedNew > 0 && upserted === 0 && edgesUpserted === 0 ? 402 : 200;
    res.status(status).json({
      upserted,
      skippedNew,
      edgesUpserted,
      endpointLimit: limit || null,
    });
  } catch (error) {
    console.error('Inventory upsert error:', error);
    res.status(500).json({ error: 'Failed to upsert inventory' });
  }
});

export default router;
