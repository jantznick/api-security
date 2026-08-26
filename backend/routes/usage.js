/**
 * Usage & license (S1) — entitlement vs consumption.
 *
 * After S2: services are the inventory unit under Org → Project → Service.
 * Seat limits: Free = 3 (D11); Pro = unlimited until priced.
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
 * Prefers Plan.seatLimit when set.
 * @returns {number | null} null = unlimited
 */
function seatLimitForPlan(planSlug, planSeatLimit) {
  if (planSeatLimit !== undefined && planSeatLimit !== null) {
    return planSeatLimit;
  }
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
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            isPersonal: true,
            _count: { select: { memberships: true } },
          },
        },
      },
    });

    const orgIds = memberships.map((m) => m.organizationId);

    const serviceRows =
      orgIds.length === 0
        ? []
        : await prisma.service.findMany({
            where: { project: { organizationId: { in: orgIds } } },
            select: {
              id: true,
              name: true,
              endpointLimit: true,
              projectId: true,
              project: { select: { id: true, name: true } },
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
          });

    const planSlug = user.planSlug || DEFAULT_PLAN_SLUG;
    const plan = await getPlanBySlug(planSlug);
    const planLimit = await resolveEndpointLimit(planSlug);

    const services = serviceRows.map((s) => {
      const endpointCount = s._count.endpoints;
      const endpointLimit = s.endpointLimit ?? planLimit;
      const lastEndpoint = s.endpoints[0]?.lastSeenAt ?? null;
      const lastKey = s.apiKeys[0]?.lastUsedAt ?? null;

      return {
        id: s.id,
        name: s.name,
        projectId: s.projectId,
        projectName: s.project?.name ?? null,
        endpointCount,
        endpointLimit,
        apiKeyCount: s._count.apiKeys,
        lastIngestAt: maxDate(lastEndpoint, lastKey),
      };
    });

    const projectIds = new Set(services.map((s) => s.projectId).filter(Boolean));

    const personal = memberships.find((m) => m.organization.isPersonal);
    const seatsUsed = personal?.organization._count.memberships ?? 1;

    const totals = {
      endpoints: services.reduce((sum, s) => sum + s.endpointCount, 0),
      services: services.length,
      projects: projectIds.size,
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
        used: seatsUsed,
        limit: seatLimitForPlan(planSlug, plan.seatLimit),
      },
      billingUnit: 'user',
      limitScope: 'per_service',
    });
  } catch (error) {
    console.error('Usage me error:', error);
    res.status(500).json({ error: 'Failed to load usage' });
  }
});

export default router;
