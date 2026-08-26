import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  applyPlanToUser,
  DEFAULT_PLAN_SLUG,
  getPlanBySlug,
  isStripeConfigured,
  listPlans,
  resolveContactSalesUrl,
  resolveEndpointLimit,
  resolveStripePriceId,
  stripeUnavailableMessage,
} from '../lib/plans.js';

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

function appBaseUrl() {
  const fromList = (process.env.FRONTEND_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    process.env.FRONTEND_URL?.trim() ||
    fromList[0] ||
    'http://localhost:5173'
  ).replace(/\/$/, '');
}

function publicPlan(plan) {
  const contactSales = Boolean(plan.contactSales);
  const hasStripePrice =
    !contactSales &&
    (Boolean(plan.stripePriceId) ||
      (plan.slug === 'pro' && Boolean(process.env.STRIPE_PRICE_PRO?.trim())));
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description || null,
    endpointLimit: plan.endpointLimit,
    seatLimit: plan.seatLimit ?? null,
    priceCentsMonthly: plan.priceCentsMonthly,
    contactSales,
    contactUrl: resolveContactSalesUrl(plan),
    /** Whether Checkout can use this plan (has a Stripe price id or env fallback) */
    hasStripePrice,
    sortOrder: plan.sortOrder,
  };
}

/** GET /api/billing/plans — active plans (public; for marketing/billing UI) */
router.get('/plans', async (_req, res) => {
  try {
    const plans = await listPlans({ activeOnly: true });
    res.json({
      plans: plans.map(publicPlan),
      billingUnit: 'user',
      limitScope: 'per_service',
    });
  } catch (error) {
    console.error('List billing plans error:', error);
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

/** GET /api/billing/me — current plan, usage, limits (auth) */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        email: true,
        planSlug: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const plan = await getPlanBySlug(user.planSlug || DEFAULT_PLAN_SLUG);
    const planLimit = await resolveEndpointLimit(user.planSlug);

    // Services across orgs the user belongs to (S2). Keep `projects` alias for UI.
    const services = await prisma.service.findMany({
      where: {
        project: {
          organization: {
            memberships: { some: { userId: user.id } },
          },
        },
      },
      select: {
        id: true,
        name: true,
        endpointLimit: true,
        projectId: true,
        project: { select: { id: true, name: true } },
        _count: { select: { endpoints: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const serviceRows = services.map((s) => ({
      id: s.id,
      name: s.name,
      projectId: s.projectId,
      projectName: s.project?.name,
      endpointCount: s._count.endpoints,
      endpointLimit: s.endpointLimit ?? planLimit,
    }));

    const endpointUsageTotal = serviceRows.reduce((sum, p) => sum + p.endpointCount, 0);
    const stripeConfigured = isStripeConfigured();
    const hasCustomer = Boolean(user.stripeCustomerId);
    const planSlug = user.planSlug || DEFAULT_PLAN_SLUG;

    // Seats for personal org: count members (owner included). Enforced in S4.
    const personalMembership = await prisma.membership.findFirst({
      where: { userId: user.id, organization: { isPersonal: true } },
      select: { organizationId: true },
    });
    let seatsUsed = 1;
    if (personalMembership) {
      seatsUsed = await prisma.membership.count({
        where: { organizationId: personalMembership.organizationId },
      });
    }

    res.json({
      plan: publicPlan(plan),
      planSlug,
      planName: plan.name,
      /** Sum of endpoints across services (UI); limit is still per-service */
      endpointsUsed: endpointUsageTotal,
      endpointCount: endpointUsageTotal,
      endpointLimit: planLimit,
      endpointLimitPerProject: planLimit,
      endpointLimitPerService: planLimit,
      endpointUsageTotal,
      services: serviceRows,
      /** @deprecated alias — same as services (legacy Project = Service) */
      projects: serviceRows,
      seats: { used: seatsUsed, limit: plan.seatLimit ?? null },
      checkoutAvailable: stripeConfigured,
      canCheckout: stripeConfigured,
      portalAvailable: stripeConfigured && hasCustomer,
      canManage: stripeConfigured && hasCustomer,
      stripeConfigured,
      hasCustomer,
      stripe: {
        configured: stripeConfigured,
        hasCustomer,
        hasSubscription: Boolean(user.stripeSubscriptionId),
      },
      billingUnit: 'user',
      limitScope: 'per_service',
    });
  } catch (error) {
    console.error('Billing me error:', error);
    res.status(500).json({ error: 'Failed to load billing status' });
  }
});

/** POST /api/billing/checkout — Stripe Checkout Session (auth) */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: stripeUnavailableMessage() });
      return;
    }

    const stripe = getStripe();
    const planSlug = String(req.body?.planSlug || 'pro').trim().toLowerCase() || 'pro';
    const plan = await getPlanBySlug(planSlug);
    if (plan.contactSales) {
      res.status(400).json({
        error:
          'This plan requires contacting sales. Use the contact link on the billing page.',
        contactUrl: resolveContactSalesUrl(plan),
      });
      return;
    }
    const priceId = await resolveStripePriceId(planSlug);
    if (!priceId) {
      res.status(400).json({
        error:
          'No Stripe price configured for this plan. Set Plan.stripePriceId in /admin or STRIPE_PRICE_PRO on Railway core.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
      },
    });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const base = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/account?billing=success`,
      cancel_url: `${base}/account?billing=cancel`,
      client_reference_id: user.id,
      metadata: { userId: user.id, planSlug },
      subscription_data: {
        metadata: { userId: user.id, planSlug },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/** POST /api/billing/portal — Stripe Customer Portal (auth) */
router.post('/portal', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: stripeUnavailableMessage() });
      return;
    }

    const stripe = getStripe();
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({
        error: 'No Stripe customer yet. Start Checkout first.',
      });
      return;
    }

    const base = appBaseUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${base}/account`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

/**
 * Map a Stripe subscription object → applyPlanToUser.
 * Exported for the raw webhook handler in server.js.
 */
export async function handleSubscriptionChange(subscription) {
  const userId =
    subscription.metadata?.userId ||
    (await findUserIdByCustomer(subscription.customer));

  if (!userId) {
    console.warn('Stripe subscription event: no userId for', subscription.id);
    return;
  }

  const status = subscription.status;
  const active = status === 'active' || status === 'trialing';
  const planSlug = active
    ? subscription.metadata?.planSlug || 'pro'
    : DEFAULT_PLAN_SLUG;

  await applyPlanToUser(userId, planSlug, {
    stripeSubscriptionId: active ? subscription.id : null,
  });
}

async function findUserIdByCustomer(customerId) {
  if (!customerId) return null;
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: String(customerId) },
    select: { id: true },
  });
  return user?.id || null;
}

export async function handleCheckoutCompleted(session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  if (!userId) return;

  const planSlug = session.metadata?.planSlug || 'pro';
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (customerId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId: customerId,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      },
    });
  }

  await applyPlanToUser(userId, planSlug, {
    stripeSubscriptionId: subscriptionId || undefined,
  });
}

/**
 * Express handler for POST /api/billing/webhook.
 * Expects req.body as a Buffer (express.raw). Mounted in server.js before json parser.
 */
export async function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: stripeUnavailableMessage() });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  let event;

  try {
    if (webhookSecret) {
      const signature = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } else {
      // Dev-only path when secret unset — still parse JSON body
      console.warn('STRIPE_WEBHOOK_SECRET unset — skipping signature verification');
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString('utf8'))
        : req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await handleSubscriptionChange(event.data.object);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

export default router;
