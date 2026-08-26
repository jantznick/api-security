/**
 * Plan resolution and subscription → org/service limit sync.
 *
 * Catalog `Plan` rows are templates (marketing, checkout, Admin editor).
 * Entitlements for existing customers live as **snapshots on Organization**:
 * `planSlug`, `endpointLimit`, `seatLimit`, `planAssignedAt`.
 * Editing a Plan template does **not** cascade to orgs — only assign/apply does.
 *
 * Billing unit: still **user-level** until S5. `applyPlanToUser` snapshots onto
 * personal orgs the user owns and syncs Service.endpointLimit from that snapshot.
 *
 * Fallback constants apply only when the Plan table is empty / missing a slug.
 */

import prisma from './prisma.js';

/** Seat caps (D11). Free = 3 including owner; Pro unlimited until priced. */
export const SEAT_LIMITS = Object.freeze({
  free: 3,
  pro: null,
});

export const FALLBACK_PLANS = Object.freeze({
  free: Object.freeze({
    slug: 'free',
    name: 'Free',
    description: null,
    endpointLimit: 25,
    seatLimit: SEAT_LIMITS.free,
    priceCentsMonthly: 0,
    stripePriceId: null,
    contactSales: false,
    contactUrl: null,
    active: true,
    sortOrder: 0,
  }),
  pro: Object.freeze({
    slug: 'pro',
    name: 'Pro',
    description: null,
    endpointLimit: 500,
    seatLimit: SEAT_LIMITS.pro,
    priceCentsMonthly: 2900,
    stripePriceId: null,
    contactSales: false,
    contactUrl: null,
    active: true,
    sortOrder: 10,
  }),
});

export const DEFAULT_PLAN_SLUG = 'free';

const planPublicSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  endpointLimit: true,
  seatLimit: true,
  priceCentsMonthly: true,
  stripePriceId: true,
  contactSales: true,
  contactUrl: true,
  active: true,
  sortOrder: true,
};

function normalizeSlug(slug) {
  return String(slug || DEFAULT_PLAN_SLUG).trim().toLowerCase() || DEFAULT_PLAN_SLUG;
}

function fromFallback(slug) {
  const key = normalizeSlug(slug);
  const row = FALLBACK_PLANS[key] || FALLBACK_PLANS.free;
  return { ...row, id: null };
}

function seatLimitForSlug(slug) {
  const key = normalizeSlug(slug);
  if (Object.prototype.hasOwnProperty.call(SEAT_LIMITS, key)) {
    return SEAT_LIMITS[key];
  }
  return SEAT_LIMITS.free;
}

/** Ensure Free/Pro rows exist (idempotent). Safe to call on boot or first admin load. */
export async function ensureDefaultPlans() {
  const defaults = [FALLBACK_PLANS.free, FALLBACK_PLANS.pro];
  for (const plan of defaults) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: {
        slug: plan.slug,
        name: plan.name,
        description: plan.description ?? null,
        endpointLimit: plan.endpointLimit,
        seatLimit: plan.seatLimit,
        priceCentsMonthly: plan.priceCentsMonthly,
        stripePriceId: plan.stripePriceId,
        contactSales: plan.contactSales ?? false,
        contactUrl: plan.contactUrl ?? null,
        active: plan.active,
        sortOrder: plan.sortOrder,
      },
      update: {
        // Catalog only — keep seatLimit aligned with product constants for Free/Pro templates.
        // Org snapshots are never touched here.
        seatLimit: plan.seatLimit,
      },
    });
  }
}

export async function listPlans({ activeOnly = false } = {}) {
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: planPublicSelect,
  });
  if (plans.length) return plans;
  return Object.values(FALLBACK_PLANS).map((p) => ({ ...p, id: null }));
}

export async function getPlanBySlug(slug) {
  const normalized = normalizeSlug(slug);
  try {
    const plan = await prisma.plan.findUnique({
      where: { slug: normalized },
      select: planPublicSelect,
    });
    if (plan) {
      return {
        ...plan,
        seatLimit: plan.seatLimit ?? seatLimitForSlug(normalized),
      };
    }
  } catch (err) {
    console.warn('getPlanBySlug DB lookup failed, using fallback:', err.message);
  }
  return fromFallback(normalized);
}

/** Effective endpoint cap for a plan slug (null = unlimited). Catalog / new-assign only. */
export async function resolveEndpointLimit(planSlug) {
  const plan = await getPlanBySlug(planSlug);
  return plan.endpointLimit ?? null;
}

/** Effective seat cap for a plan slug (null = unlimited). Catalog / new-assign only. */
export async function resolveSeatLimit(planSlug) {
  const plan = await getPlanBySlug(planSlug);
  return plan.seatLimit ?? seatLimitForSlug(planSlug);
}

/**
 * Prefer org snapshotted endpoint limit; legacy null → live Plan by slug.
 * @param {{ endpointLimit?: number|null, planSlug?: string|null } | null} org
 */
export async function resolveOrgEndpointLimit(org) {
  if (org && org.endpointLimit !== undefined && org.endpointLimit !== null) {
    return org.endpointLimit;
  }
  // Explicit null on a snapshotted org means unlimited (planAssignedAt set).
  if (org?.planAssignedAt && org.endpointLimit === null) {
    return null;
  }
  return resolveEndpointLimit(org?.planSlug || DEFAULT_PLAN_SLUG);
}

/**
 * Prefer org snapshotted seat limit; legacy null without planAssignedAt → Plan by slug.
 * @param {{ seatLimit?: number|null, planSlug?: string|null, planAssignedAt?: Date|null } | null} org
 */
export async function resolveOrgSeatLimit(org) {
  if (!org) {
    return resolveSeatLimit(DEFAULT_PLAN_SLUG);
  }
  if (org.planAssignedAt) {
    // Snapshot present: null seatLimit = unlimited
    return org.seatLimit ?? null;
  }
  if (org.seatLimit !== undefined && org.seatLimit !== null) {
    return org.seatLimit;
  }
  return resolveSeatLimit(org.planSlug || DEFAULT_PLAN_SLUG);
}

/**
 * Copy Plan template limits onto an organization and sync Service.endpointLimit.
 * This is the only path that changes existing org entitlements (besides admin re-assign).
 */
export async function applyPlanToOrganization(organizationId, planSlug, { stripeSubscriptionId } = {}) {
  const slug = normalizeSlug(planSlug);
  const plan = await getPlanBySlug(slug);
  const endpointLimit = plan.endpointLimit ?? null;
  const seatLimit = plan.seatLimit ?? seatLimitForSlug(slug);
  const planAssignedAt = new Date();

  const orgData = {
    planSlug: slug,
    endpointLimit,
    seatLimit,
    planAssignedAt,
  };
  if (stripeSubscriptionId !== undefined) {
    orgData.stripeSubscriptionId = stripeSubscriptionId;
  }

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: orgData,
    }),
    prisma.service.updateMany({
      where: { project: { organizationId } },
      data: { endpointLimit },
    }),
  ]);

  return {
    organizationId,
    planSlug: slug,
    endpointLimit,
    seatLimit,
    planAssignedAt,
    plan,
  };
}

/**
 * Set user.planSlug (+ optional Stripe subscription id) and snapshot limits onto
 * personal orgs the user owns (S5 prep; User remains billing source of truth).
 */
export async function applyPlanToUser(userId, planSlug, { stripeSubscriptionId } = {}) {
  const slug = normalizeSlug(planSlug);
  const plan = await getPlanBySlug(slug);
  const endpointLimit = plan.endpointLimit ?? null;
  const seatLimit = plan.seatLimit ?? seatLimitForSlug(slug);

  const userData = { planSlug: slug };
  if (stripeSubscriptionId !== undefined) {
    userData.stripeSubscriptionId = stripeSubscriptionId;
  }

  const ownedPersonal = await prisma.membership.findMany({
    where: { userId, role: 'owner', organization: { isPersonal: true } },
    select: { organizationId: true },
  });
  const orgIds = ownedPersonal.map((m) => m.organizationId);
  const planAssignedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: userData,
    }),
    ...(orgIds.length
      ? [
          prisma.organization.updateMany({
            where: { id: { in: orgIds } },
            data: {
              planSlug: slug,
              endpointLimit,
              seatLimit,
              planAssignedAt,
              ...(stripeSubscriptionId !== undefined
                ? { stripeSubscriptionId }
                : {}),
            },
          }),
          prisma.service.updateMany({
            where: { project: { organizationId: { in: orgIds } } },
            data: { endpointLimit },
          }),
        ]
      : []),
  ]);

  return {
    planSlug: slug,
    endpointLimit,
    seatLimit,
    organizationIds: orgIds,
    plan,
  };
}

/** Resolve Stripe Price id for a paid self-serve plan (DB first, then env STRIPE_PRICE_PRO). */
export async function resolveStripePriceId(planSlug = 'pro') {
  const plan = await getPlanBySlug(planSlug);
  if (plan.contactSales) return null;
  if (plan.stripePriceId) return plan.stripePriceId;
  if (normalizeSlug(planSlug) === 'pro') {
    return process.env.STRIPE_PRICE_PRO?.trim() || null;
  }
  return null;
}

/**
 * Public contact URL for a contact-sales plan.
 * Prefers plan.contactUrl, then CONTACT_SALES_URL / CONTACT_SALES_EMAIL, then mailto:ADMIN_EMAIL.
 */
export function resolveContactSalesUrl(plan) {
  if (!plan?.contactSales) return null;
  const fromPlan = plan.contactUrl?.trim();
  if (fromPlan) return fromPlan;
  const envUrl = process.env.CONTACT_SALES_URL?.trim();
  if (envUrl) return envUrl;
  const email =
    process.env.CONTACT_SALES_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim();
  if (email) {
    const subject = encodeURIComponent(
      `API Glimpse — ${plan.name || 'Enterprise'} inquiry`,
    );
    return `mailto:${email}?subject=${subject}`;
  }
  return null;
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function stripeUnavailableMessage() {
  return 'Stripe is not configured. Set STRIPE_SECRET_KEY on the Railway core service.';
}
