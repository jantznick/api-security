import express from 'express';
import prisma from '../lib/prisma.js';
import { requireApiKey } from '../middleware/apiKey.js';

const router = express.Router();

router.use(requireApiKey);

/**
 * Prefer per-project limit (Stripe → Project.endpointLimit).
 * Fall back to env ENDPOINT_LIMIT. 0 / null / unset = unlimited.
 */
function resolveEndpointLimit(project) {
  const fromProject = project?.endpointLimit;
  if (fromProject !== undefined && fromProject !== null) {
    const n = Number(fromProject);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return 0;
  }
  const raw = process.env.ENDPOINT_LIMIT;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Idempotent upsert of endpoint inventory + signals.
 * Body: { endpoints: [ { method, pathTemplate, hitCount, authModes, statusCodes,
 *   contentTypes, requestSchema, responseSchema, signals, firstSeenAt, lastSeenAt } ] }
 *
 * Never accepts or stores raw request/response bodies.
 * New endpoints may be skipped when the project/env endpoint limit is exceeded (existing still update).
 */
router.post('/upsert', async (req, res) => {
  try {
    const projectId = req.project.id;
    const endpoints = Array.isArray(req.body?.endpoints) ? req.body.endpoints : [];
    const limit = resolveEndpointLimit(req.project);

    if (endpoints.length === 0) {
      res.json({ upserted: 0, skippedNew: 0 });
      return;
    }

    let upserted = 0;
    let skippedNew = 0;
    let currentCount = null;

    async function loadCount() {
      if (currentCount === null) {
        currentCount = await prisma.endpoint.count({ where: { projectId } });
      }
      return currentCount;
    }

    for (const delta of endpoints) {
      const method = String(delta.method || '').toUpperCase();
      const pathTemplate = String(delta.pathTemplate || '');
      if (!method || !pathTemplate) continue;

      const existing = await prisma.endpoint.findUnique({
        where: {
          projectId_method_pathTemplate: { projectId, method, pathTemplate },
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
          projectId_method_pathTemplate: { projectId, method, pathTemplate },
        },
        create: {
          projectId,
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

    const status = skippedNew > 0 && upserted === 0 ? 402 : 200;
    res.status(status).json({
      upserted,
      skippedNew,
      endpointLimit: limit || null,
    });
  } catch (error) {
    console.error('Inventory upsert error:', error);
    res.status(500).json({ error: 'Failed to upsert inventory' });
  }
});

export default router;
