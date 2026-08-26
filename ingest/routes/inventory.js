import express from 'express';
import prisma from '../lib/prisma.js';
import { requireApiKey } from '../middleware/apiKey.js';
import {
  isAuthRegression,
  normalizeAuthModes,
  recordInventoryEvent,
  resolveWebhookUrl,
} from '../lib/driftEvents.js';

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
 * Load webhook URL (service override → project) once per request.
 */
async function loadWebhookContext(serviceId) {
  const row = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      webhookUrl: true,
      project: { select: { webhookUrl: true } },
    },
  });
  return resolveWebhookUrl(row);
}

/**
 * Idempotent upsert of endpoint inventory + signals.
 * Body: { endpoints: [ { method, pathTemplate, hitCount, authModes, statusCodes,
 *   contentTypes, requestSchema, responseSchema, signals, firstSeenAt, lastSeenAt } ] }
 *
 * Never accepts or stores raw request/response bodies.
 * New endpoints may be skipped when the service/env endpoint limit is exceeded (existing still update).
 * SF2: emits InventoryEvent rows for discovery / new signals / auth regression.
 */
router.post('/upsert', async (req, res) => {
  try {
    const service = req.service || req.project;
    const serviceId = service.id;
    const endpoints = Array.isArray(req.body?.endpoints) ? req.body.endpoints : [];
    const limit = resolveEndpointLimit(service);

    if (endpoints.length === 0) {
      res.json({ upserted: 0, skippedNew: 0, events: 0 });
      return;
    }

    let upserted = 0;
    let skippedNew = 0;
    let eventsCreated = 0;
    let currentCount = null;
    const webhookUrl = await loadWebhookContext(serviceId);

    async function loadCount() {
      if (currentCount === null) {
        currentCount = await prisma.endpoint.count({ where: { serviceId } });
      }
      return currentCount;
    }

    async function emitEvent(type, endpointId, payload) {
      await recordInventoryEvent(prisma, {
        serviceId,
        endpointId,
        type,
        payload,
        webhookUrl,
      });
      eventsCreated += 1;
    }

    for (const delta of endpoints) {
      const method = String(delta.method || '').toUpperCase();
      const pathTemplate = String(delta.pathTemplate || '');
      if (!method || !pathTemplate) continue;

      const existing = await prisma.endpoint.findUnique({
        where: {
          serviceId_method_pathTemplate: { serviceId, method, pathTemplate },
        },
        include: {
          signals: {
            select: { type: true, fieldPath: true, category: true },
          },
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

      const prevAuth = normalizeAuthModes(existing?.authModes);
      const sampleAuth = normalizeAuthModes(delta.authModes);
      const authModes = [...new Set([...prevAuth, ...sampleAuth])];

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

      const wasNew = !existing;

      // Auth regression: detect before upsert while old row is visible.
      // Hysteresis: prior strong auth + sample exclusively none + prior hits;
      // skip if an unread auth.regressed already exists for this endpoint.
      let shouldAuthRegress = false;
      if (
        existing &&
        isAuthRegression({
          prevAuth,
          sampleAuth,
          hitCount: existing.hitCount,
        })
      ) {
        const prior = await prisma.inventoryEvent.findFirst({
          where: {
            serviceId,
            endpointId: existing.id,
            type: 'auth.regressed',
            readAt: null,
          },
          select: { id: true },
        });
        shouldAuthRegress = !prior;
      }

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

      if (wasNew) {
        currentCount = (await loadCount()) + 1;
        await emitEvent('endpoint.discovered', endpoint.id, {
          method,
          pathTemplate,
          hitCount: hitInc,
          authModes: sampleAuth,
        });
      }

      if (shouldAuthRegress) {
        await emitEvent('auth.regressed', endpoint.id, {
          method,
          pathTemplate,
          previousAuthModes: prevAuth,
          sampleAuthModes: sampleAuth,
          hitCountBefore: existing.hitCount,
        });
      }

      const existingSignalKeys = new Set(
        (existing?.signals || []).map(
          (s) => `${s.type}\0${s.fieldPath}\0${s.category}`,
        ),
      );

      for (const signal of delta.signals || []) {
        const type = String(signal.type || 'sensitive_field');
        const fieldPath = String(signal.fieldPath || '');
        const category = String(signal.category || 'unknown');
        if (!fieldPath) continue;

        const signalKey = `${type}\0${fieldPath}\0${category}`;
        const isNewSignal = !existingSignalKeys.has(signalKey);

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

        if (isNewSignal) {
          existingSignalKeys.add(signalKey);
          // Prefer sensitive_field; skip auth_observed noise.
          if (type !== 'auth_observed') {
            await emitEvent('signal.appeared', endpoint.id, {
              method,
              pathTemplate,
              signalType: type,
              fieldPath,
              category,
              severity: String(signal.severity || 'info'),
              newEndpoint: wasNew,
            });
          }
        }
      }

      upserted += 1;
    }

    const status = skippedNew > 0 && upserted === 0 ? 402 : 200;
    res.status(status).json({
      upserted,
      skippedNew,
      events: eventsCreated,
      endpointLimit: limit || null,
    });
  } catch (error) {
    console.error('Inventory upsert error:', error);
    res.status(500).json({ error: 'Failed to upsert inventory' });
  }
});

export default router;
