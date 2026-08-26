/**
 * SF9 — project topology baseline helpers (DB + shared compare).
 */

import {
  buildObservedGraph,
  compareTopology,
  driftEventsFromCompare,
  normalizeTopologyBaseline,
} from '@apiglimpse/shared';
import { postWebhook } from './webhooks.js';

/** Strip runtime-only fields before persisting baseline JSON. */
export function baselineForStorage(baseline) {
  if (!baseline || typeof baseline !== 'object') return baseline;
  const { _nodeById, ...rest } = baseline;
  return rest;
}

/** Rehydrate normalized baseline (with _nodeById) from stored JSON. */
export function baselineFromStorage(stored) {
  if (!stored || typeof stored !== 'object') return null;
  return normalizeTopologyBaseline(stored);
}

/**
 * Fetch project services + traffic edges and build observed graph.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} projectId
 */
export async function loadObservedGraph(prisma, projectId) {
  const services = await prisma.service.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      trafficEdges: {
        select: {
          callerKey: true,
          callerLabel: true,
          method: true,
          pathTemplate: true,
          hitCount: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const graph = buildObservedGraph(services);
  return { ...graph, projectId };
}

/**
 * Persist new drift events from a compare result (deduped by driftKey).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} projectId
 * @param {object} compare
 * @param {{ webhookUrl?: string | null }} [options]
 */
export async function recordTopologyDrift(prisma, projectId, compare, options = {}) {
  const existing = await prisma.projectTopologyEvent.findMany({
    where: { projectId },
    select: { driftKey: true },
  });
  const existingKeys = new Set(existing.map((row) => row.driftKey));
  const pending = driftEventsFromCompare(compare, existingKeys);

  /** @type {object[]} */
  const created = [];

  for (const ev of pending) {
    const row = await prisma.projectTopologyEvent.upsert({
      where: {
        projectId_driftKey: { projectId, driftKey: ev.driftKey },
      },
      create: {
        projectId,
        type: ev.type,
        driftKey: ev.driftKey,
        payload: ev.payload,
      },
      update: {},
    });
    created.push(row);

    const webhookUrl = options.webhookUrl;
    if (webhookUrl) {
      void postWebhook(webhookUrl, {
        type: row.type,
        projectId,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  return created;
}

/**
 * Compare stored baseline against observed graph for a project.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} projectId
 * @param {object|null} storedBaseline raw JSON from Project.topologyBaseline
 */
export async function compareProjectTopology(prisma, projectId, storedBaseline) {
  const baseline = baselineFromStorage(storedBaseline);
  if (!baseline) return null;

  const observed = await loadObservedGraph(prisma, projectId);
  return {
    ...compareTopology(baseline, observed),
    projectId,
  };
}

export { compareTopology, normalizeTopologyBaseline };
