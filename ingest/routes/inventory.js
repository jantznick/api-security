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

function hadStrongAuth(modes) {
  const list = Array.isArray(modes) ? modes : [];
  return list.some((m) => m === 'bearer' || m === 'cookie');
}

function onlyNoneAuth(modes) {
  const list = Array.isArray(modes) ? modes : [];
  if (list.length === 0) return true;
  return list.every((m) => m === 'none');
}

/** Fire-and-forget generic webhook (SF2). Never throws. */
async function fireWebhook(url, payload) {
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    /* fail-open */
  }
}

async function recordEvent(service, endpointId, type, payload) {
  const event = await prisma.inventoryEvent.create({
    data: {
      serviceId: service.id,
      endpointId: endpointId || null,
      type,
      payload: payload || {},
    },
  });

  const webhookUrl = service.webhookUrl || service.project?.webhookUrl || null;
  if (webhookUrl) {
    void fireWebhook(webhookUrl, {
      type: event.type,
      id: event.id,
      serviceId: service.id,
      endpointId: event.endpointId,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    });
  }
  return event;
}

/**
 * Idempotent upsert of endpoint inventory + signals + optional topology edges.
 * Body: {
 *   endpoints: [...],
 *   edges?: [{ callerKey, callerLabel, method, pathTemplate, hitCount, lastSeenAt }]
 * }
 */
router.post('/upsert', async (req, res) => {
  try {
    const service = req.service || req.project;
    const serviceId = service.id;
    const endpoints = Array.isArray(req.body?.endpoints) ? req.body.endpoints : [];
    const edges = Array.isArray(req.body?.edges) ? req.body.edges : [];
    const limit = resolveEndpointLimit(service);

    // Load project webhook for SF2 if relation available
    let serviceWithProject = service;
    if (!service.project) {
      try {
        serviceWithProject = await prisma.service.findUnique({
          where: { id: serviceId },
          include: { project: { select: { webhookUrl: true } } },
        });
      } catch {
        serviceWithProject = service;
      }
    }

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
        include: { signals: { select: { type: true, fieldPath: true, category: true } } },
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
      const deltaAuth = Array.isArray(delta.authModes) ? delta.authModes : [];
      const authModes = [...new Set([...prevAuth, ...deltaAuth])];

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
        await recordEvent(serviceWithProject, endpoint.id, 'endpoint.discovered', {
          method,
          pathTemplate,
        });
      } else if (
        existing.hitCount > 0 &&
        hadStrongAuth(prevAuth) &&
        onlyNoneAuth(deltaAuth) &&
        !onlyNoneAuth(prevAuth)
      ) {
        // Auth regression: previously had bearer/cookie; this batch only reports none
        await recordEvent(serviceWithProject, endpoint.id, 'auth.regressed', {
          method,
          pathTemplate,
          previousAuthModes: prevAuth,
          observedAuthModes: deltaAuth,
        });
      }

      const existingSignalKeys = new Set(
        (existing?.signals || []).map((s) => `${s.type}|${s.fieldPath}|${s.category}`),
      );

      for (const signal of delta.signals || []) {
        const type = String(signal.type || 'sensitive_field');
        const fieldPath = String(signal.fieldPath || '');
        const category = String(signal.category || 'unknown');
        if (!fieldPath) continue;

        const sigKey = `${type}|${fieldPath}|${category}`;
        const isNew = !existingSignalKeys.has(sigKey);

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

        if (isNew && type === 'sensitive_field') {
          existingSignalKeys.add(sigKey);
          await recordEvent(serviceWithProject, endpoint.id, 'signal.appeared', {
            method,
            pathTemplate,
            type,
            fieldPath,
            category,
            severity: String(signal.severity || 'info'),
          });
        }
      }

      upserted += 1;
    }

    for (const edge of edges) {
      const method = String(edge.method || '').toUpperCase();
      const pathTemplate = String(edge.pathTemplate || '');
      const callerKey = String(edge.callerKey || '').trim();
      const callerLabel = String(edge.callerLabel || edge.callerName || callerKey).trim();
      if (!method || !pathTemplate || !callerKey) continue;
      const hitInc = Number(edge.hitCount) || 1;
      const lastSeenAt = edge.lastSeenAt ? new Date(edge.lastSeenAt) : new Date();

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
          callerLabel,
          method,
          pathTemplate,
          hitCount: hitInc,
          lastSeenAt,
        },
        update: {
          callerLabel,
          hitCount: { increment: hitInc },
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
