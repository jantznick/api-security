/**
 * Plan resolution and subscription → project limit sync.
 *
 * Billing unit: **user-level subscription**. When the plan changes,
 * `Plan.endpointLimit` is written onto **each** of the user's projects
 * (not a shared sum across projects).
 *
 * Fallback constants apply only when the Plan table is empty / missing a slug.
 */

import prisma from './prisma.js';

export const FALLBACK_PLANS = Object.freeze({
  free: Object.freeze({
    slug: 'free',
    name: 'Free',
    description: null,
    endpointLimit: 25,
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
        priceCentsMonthly: plan.priceCentsMonthly,
        stripePriceId: plan.stripePriceId,
        contactSales: plan.contactSales ?? false,
        contactUrl: plan.contactUrl ?? null,
        active: plan.active,
        sortOrder: plan.sortOrder,
      },
      update: {},
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
    if (plan) return plan;
  } catch (err) {
    console.warn('getPlanBySlug DB lookup failed, using fallback:', err.message);
  }
  return fromFallback(normalized);
}

/** Effective endpoint cap for a plan slug (null = unlimited). */
export async function resolveEndpointLimit(planSlug) {
  const plan = await getPlanBySlug(planSlug);
  return plan.endpointLimit ?? null;
}

/**
 * Set user.planSlug (+ optional Stripe subscription id) and sync
 * endpointLimit onto every owned project.
 */
export async function applyPlanToUser(userId, planSlug, { stripeSubscriptionId } = {}) {
  const slug = normalizeSlug(planSlug);
  const plan = await getPlanBySlug(slug);
  const endpointLimit = plan.endpointLimit ?? null;

  const userData = { planSlug: slug };
  if (stripeSubscriptionId !== undefined) {
    userData.stripeSubscriptionId = stripeSubscriptionId;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: userData,
    }),
    prisma.project.updateMany({
      where: { ownerId: userId },
      data: { endpointLimit },
    }),
  ]);

  return { planSlug: slug, endpointLimit, plan };
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
