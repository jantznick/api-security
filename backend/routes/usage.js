/**
 * Usage & license (S1) — entitlement vs consumption.
 *
 * Until Org → Project → Service (S2), each owned Project is exposed as a
 * "service" (today's inventory unit). projectId / projectName stay null.
 *
 * Seats (D11): Free = 3 total members (owner counts). Until orgs/invites,
 * seats.used is always 1. Pro seat cap is null (unlimited) until priced.
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  DEFAULT_PLAN_SLUG,
  getPlanBySlug,
  resolveEndpointLimit,
} from '../lib/plans.js';

const router = express.Router();

/** Free plan seat allowance (D11). Owner counts toward the limit. */
const FREE_SEAT_LIMIT = 3;

/**
 * Pro / paid plans: seat cap TBD when pricing locks — treat as unlimited.
 * @returns {number | null} null = unlimited
 */
function seatLimitForPlan(planSlug) {
  const slug = String(planSlug || DEFAULT_PLAN_SLUG).toLowerCase();
  if (slug === 'free') return FREE_SEAT_LIMIT;
  return null;
}

function maxDate(...dates) {
  let best = null;
  for (const d of dates) {
    if (!d) continue;
    const t = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(t.getTime())) continue;
    if (!best || t > best) best = t;
  }
  return best ? best.toISOString() : null;
}

/** License status for UI: free | active | past_due (past_due reserved for Stripe). */
function licenseStatus(planSlug, hasSubscription) {
  const slug = String(planSlug || DEFAULT_PLAN_SLUG).toLowerCase();
  if (slug === 'free') return 'free';
  if (hasSubscription) return 'active';
  return 'active';
}

/** GET /api/usage/me — plan entitlements + per-service consumption (auth) */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        planSlug: true,
        stripeSubscriptionId: true,
        projects: {
          select: {
            id: true,
            name: true,
            endpointLimit: true,
            _count: {
              select: {
                endpoints: true,
                apiKeys: { where: { revokedAt: null } },
              },
            },
            endpoints: {
              select: { lastSeenAt: true },
              orderBy: { lastSeenAt: 'desc' },
              take: 1,
            },
            apiKeys: {
              where: { revokedAt: null },
              select: { lastUsedAt: true },
              orderBy: { lastUsedAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const planSlug = user.planSlug || DEFAULT_PLAN_SLUG;
    const plan = await getPlanBySlug(planSlug);
    const planLimit = await resolveEndpointLimit(planSlug);

    // Today's Project = future Service (S2). No parent Project yet.
    const services = user.projects.map((p) => {
      const endpointCount = p._count.endpoints;
      const endpointLimit = p.endpointLimit ?? planLimit;
      const lastEndpoint = p.endpoints[0]?.lastSeenAt ?? null;
      const lastKey = p.apiKeys[0]?.lastUsedAt ?? null;

      return {
        id: p.id,
        name: p.name,
        /** Parent Project after S2; null while Project ≡ Service */
        projectId: null,
        projectName: null,
        endpointCount,
        endpointLimit,
        apiKeyCount: p._count.apiKeys,
        lastIngestAt: maxDate(lastEndpoint, lastKey),
      };
    });

    const totals = {
      endpoints: services.reduce((sum, s) => sum + s.endpointCount, 0),
      services: services.length,
      /** Distinct parent projects after S2; 0 until hierarchy exists */
      projects: 0,
    };

    res.json({
      plan: {
        slug: plan.slug,
        name: plan.name,
        endpointLimit: plan.endpointLimit ?? planLimit,
        status: licenseStatus(planSlug, Boolean(user.stripeSubscriptionId)),
      },
      /** Stripe billing period when available; null until org billing (S5) */
      period: { start: null, end: null },
      services,
      totals,
      seats: {
        used: 1,
        limit: seatLimitForPlan(planSlug),
      },
      billingUnit: 'user',
      limitScope: 'per_project',
    });
  } catch (error) {
    console.error('Usage me error:', error);
    res.status(500).json({ error: 'Failed to load usage' });
  }
});

export default router;
