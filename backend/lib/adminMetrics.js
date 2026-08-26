/**
 * Aggregate SaaS owner metrics for the platform admin dashboard.
 * Hierarchy: Organization → Project → Service (inventory unit).
 * Billing remains user-level until S5.
 */

import prisma from './prisma.js';
import { ensureDefaultPlans, listPlans } from './plans.js';
import { listMembershipIncludeForSummary, mapListedUser } from './adminUsers.js';

function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return startOfUtcDay(d);
}

function formatMoneyCents(cents) {
  return Math.round(Number(cents) || 0);
}

/**
 * Build daily signup buckets for the last `days` UTC days (inclusive of today).
 */
function buildSignupSeries(users, days = 30) {
  const buckets = [];
  const counts = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = daysAgo(i);
    const key = day.toISOString().slice(0, 10);
    counts.set(key, 0);
    buckets.push({ date: key, count: 0 });
  }
  for (const u of users) {
    const key = startOfUtcDay(u.createdAt).toISOString().slice(0, 10);
    if (counts.has(key)) {
      counts.set(key, counts.get(key) + 1);
    }
  }
  return buckets.map((b) => ({ date: b.date, count: counts.get(b.date) || 0 }));
}

function countServicesForUser(memberships) {
  let n = 0;
  for (const m of memberships || []) {
    for (const p of m.organization?.projects || []) {
      n += p._count?.services ?? 0;
    }
  }
  return n;
}

function countProjectsForUser(memberships) {
  let n = 0;
  for (const m of memberships || []) {
    n += m.organization?.projects?.length ?? 0;
  }
  return n;
}

const membershipInventorySelect = listMembershipIncludeForSummary;

export async function getAdminOverview() {
  await ensureDefaultPlans();
  const plans = await listPlans({ activeOnly: false });
  const planBySlug = new Map(plans.map((p) => [p.slug, p]));

  const since7 = daysAgo(7);
  const since30 = daysAgo(30);
  const since30Inclusive = daysAgo(29); // 30 calendar days including today

  const [
    totalUsers,
    usersByPlan,
    newUsers7d,
    newUsers30d,
    subscribedUsers,
    stripeCustomers,
    totalOrganizations,
    totalProjects,
    totalServices,
    totalEndpoints,
    totalApiKeys,
    activeApiKeys,
    revokedApiKeys,
    totalSignals,
    hitAggregate,
    recentUsers,
    signupUsers,
    ownersWithServices,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({
      by: ['planSlug'],
      _count: { _all: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.user.count({
      where: { stripeSubscriptionId: { not: null } },
    }),
    prisma.user.count({
      where: { stripeCustomerId: { not: null } },
    }),
    prisma.organization.count(),
    prisma.project.count(),
    prisma.service.count(),
    prisma.endpoint.count(),
    prisma.apiKey.count(),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.apiKey.count({ where: { revokedAt: { not: null } } }),
    prisma.signal.count(),
    prisma.endpoint.aggregate({ _sum: { hitCount: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        email: true,
        planSlug: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        createdAt: true,
        memberships: membershipInventorySelect,
      },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: since30Inclusive } },
      select: { createdAt: true },
    }),
    prisma.membership.findMany({
      where: {
        role: 'owner',
        organization: {
          projects: { some: { services: { some: {} } } },
        },
      },
      distinct: ['userId'],
      select: { userId: true },
    }),
  ]);

  const usersWithProjects = ownersWithServices.length;
  const usersWithoutProjects = Math.max(0, totalUsers - usersWithProjects);

  const planBreakdown = plans.map((plan) => {
    const match = usersByPlan.find((row) => row.planSlug === plan.slug);
    const userCount = match?._count?._all ?? 0;
    const mrrCents = userCount * (plan.priceCentsMonthly || 0);
    return {
      slug: plan.slug,
      name: plan.name,
      active: plan.active,
      priceCentsMonthly: plan.priceCentsMonthly,
      endpointLimit: plan.endpointLimit,
      seatLimit: plan.seatLimit ?? null,
      userCount,
      mrrCents: formatMoneyCents(mrrCents),
    };
  });

  // Catch users on plan slugs that no longer exist in Plan table
  for (const row of usersByPlan) {
    if (planBySlug.has(row.planSlug)) continue;
    const userCount = row._count?._all ?? 0;
    planBreakdown.push({
      slug: row.planSlug,
      name: row.planSlug,
      active: false,
      priceCentsMonthly: 0,
      endpointLimit: null,
      seatLimit: null,
      userCount,
      mrrCents: 0,
    });
  }

  const paidUsers = planBreakdown
    .filter((p) => (p.priceCentsMonthly || 0) > 0)
    .reduce((sum, p) => sum + p.userCount, 0);
  const freeUsers = Math.max(0, totalUsers - paidUsers);
  const mrrCents = planBreakdown.reduce((sum, p) => sum + p.mrrCents, 0);
  const arrCents = mrrCents * 12;
  const totalHits = hitAggregate._sum.hitCount ?? 0;

  const signupsByDay = buildSignupSeries(signupUsers, 30);

  return {
    generatedAt: new Date().toISOString(),
    accounts: {
      totalUsers,
      freeUsers,
      paidUsers,
      subscribedUsers,
      stripeCustomers,
      newUsers7d,
      newUsers30d,
      usersWithProjects,
      usersWithoutProjects,
      organizations: totalOrganizations,
      billingUnit: 'user',
    },
    revenue: {
      mrrCents: formatMoneyCents(mrrCents),
      arrCents: formatMoneyCents(arrCents),
      currency: 'usd',
      note: 'Estimated from plan prices × users on each plan (not live Stripe invoices).',
    },
    usage: {
      totalProjects,
      totalServices,
      totalEndpoints,
      totalHits,
      totalApiKeys,
      activeApiKeys,
      revokedApiKeys,
      totalSignals,
    },
    plans: planBreakdown,
    signupsByDay,
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      email: u.email,
      planSlug: u.planSlug,
      projectCount: countProjectsForUser(u.memberships),
      serviceCount: countServicesForUser(u.memberships),
      hasStripeCustomer: Boolean(u.stripeCustomerId),
      hasSubscription: Boolean(u.stripeSubscriptionId),
      createdAt: u.createdAt,
    })),
  };
}

/**
 * Paginated user directory for admin.
 * Query: { limit?, offset?, q?, plan? }
 */
export async function listAdminUsers({ limit = 50, offset = 0, q = '', plan = '' } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = Math.max(Number(offset) || 0, 0);
  const query = String(q || '').trim();
  const planFilter = String(plan || '').trim().toLowerCase();

  const where = {};
  if (query) {
    where.email = { contains: query, mode: 'insensitive' };
  }
  if (planFilter) {
    where.planSlug = planFilter;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: {
        id: true,
        email: true,
        displayName: true,
        planSlug: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        createdAt: true,
        updatedAt: true,
        memberships: membershipInventorySelect,
      },
    }),
  ]);

  return {
    total,
    limit: take,
    offset: skip,
    users: users.map(mapListedUser),
  };
}
