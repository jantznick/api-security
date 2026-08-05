import express from 'express';
import prisma from '../lib/prisma.js';
import { requireApiKey } from '../middleware/apiKey.js';

const router = express.Router();

router.use(requireApiKey);

/**
 * Idempotent upsert of endpoint inventory + signals.
 * Body: { endpoints: [ { method, pathTemplate, hitCount, authModes, statusCodes,
 *   contentTypes, requestSchema, responseSchema, signals, firstSeenAt, lastSeenAt } ] }
 *
 * Never accepts or stores raw request/response bodies.
 */
router.post('/upsert', async (req, res) => {
  try {
    const projectId = req.project.id;
    const endpoints = Array.isArray(req.body?.endpoints) ? req.body.endpoints : [];

    if (endpoints.length === 0) {
      res.json({ upserted: 0 });
      return;
    }

    let upserted = 0;

    for (const delta of endpoints) {
      const method = String(delta.method || '').toUpperCase();
      const pathTemplate = String(delta.pathTemplate || '');
      if (!method || !pathTemplate) continue;

      const existing = await prisma.endpoint.findUnique({
        where: {
          projectId_method_pathTemplate: { projectId, method, pathTemplate },
        },
      });

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

      // Prefer newest schema from agent (already merged in-memory); fall back to existing
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

    res.json({ upserted });
  } catch (error) {
    console.error('Inventory upsert error:', error);
    res.status(500).json({ error: 'Failed to upsert inventory' });
  }
});

export default router;
