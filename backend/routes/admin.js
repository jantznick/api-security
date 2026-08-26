import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { ensureDefaultPlans, listPlans } from '../lib/plans.js';
import { getAdminOverview, listAdminUsers } from '../lib/adminMetrics.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

function serializePlan(plan) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    endpointLimit: plan.endpointLimit,
    seatLimit: plan.seatLimit ?? null,
    priceCentsMonthly: plan.priceCentsMonthly,
    stripePriceId: plan.stripePriceId,
    active: plan.active,
    sortOrder: plan.sortOrder,
    updatedAt: plan.updatedAt,
  };
}

/** GET /api/admin/overview — SaaS owner KPIs, usage, revenue, recent users */
router.get('/overview', async (_req, res) => {
  try {
    const overview = await getAdminOverview();
    res.json(overview);
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

/** GET /api/admin/users — paginated user directory (?q=&plan=&limit=&offset=) */
router.get('/users', async (req, res) => {
  try {
    const result = await listAdminUsers({
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q,
      plan: req.query.plan,
    });
    res.json(result);
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/** GET /api/admin/plans — all plans (including inactive) */
router.get('/plans', async (_req, res) => {
  try {
    const plans = await listPlans({ activeOnly: false });
    res.json({ plans: plans.map(serializePlan) });
  } catch (error) {
    console.error('Admin list plans error:', error);
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

/**
 * PUT /api/admin/plans
 * Body: { plans: [{ id?, slug, name, endpointLimit, priceCentsMonthly, stripePriceId, active, sortOrder }] }
 * Updates existing rows by id or slug; creates missing slugs.
 */
router.put('/plans', async (req, res) => {
  try {
    await ensureDefaultPlans();
    const incoming = Array.isArray(req.body?.plans) ? req.body.plans : null;
    if (!incoming) {
      res.status(400).json({ error: 'Body must include plans: []' });
      return;
    }

    const updated = [];
    for (const row of incoming) {
      const slug = String(row.slug || '')
        .trim()
        .toLowerCase();
      if (!slug) {
        res.status(400).json({ error: 'Each plan requires a slug' });
        return;
      }

      const name = String(row.name || slug).trim() || slug;
      const endpointLimit =
        row.endpointLimit === null || row.endpointLimit === '' || row.endpointLimit === undefined
          ? null
          : Number(row.endpointLimit);
      if (endpointLimit !== null && (!Number.isFinite(endpointLimit) || endpointLimit < 0)) {
        res.status(400).json({ error: `Invalid endpointLimit for plan ${slug}` });
        return;
      }

      const priceCentsMonthly = Number(row.priceCentsMonthly ?? 0);
      if (!Number.isFinite(priceCentsMonthly) || priceCentsMonthly < 0) {
        res.status(400).json({ error: `Invalid priceCentsMonthly for plan ${slug}` });
        return;
      }

      const stripePriceId =
        row.stripePriceId === null || row.stripePriceId === undefined || row.stripePriceId === ''
          ? null
          : String(row.stripePriceId).trim();

      const active = row.active !== false;
      const sortOrder = Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0;

      let seatLimit = undefined;
      if (row.seatLimit === null || row.seatLimit === '') {
        seatLimit = null;
      } else if (row.seatLimit !== undefined) {
        seatLimit = Number(row.seatLimit);
        if (!Number.isFinite(seatLimit) || seatLimit < 0) {
          res.status(400).json({ error: `Invalid seatLimit for plan ${slug}` });
          return;
        }
      }

      const data = {
        name,
        endpointLimit,
        priceCentsMonthly,
        stripePriceId,
        active,
        sortOrder,
        ...(seatLimit !== undefined ? { seatLimit } : {}),
      };

      let plan;
      if (row.id) {
        plan = await prisma.plan.update({
          where: { id: row.id },
          data: { ...data, slug },
        });
      } else {
        plan = await prisma.plan.upsert({
          where: { slug },
          create: { slug, ...data },
          update: data,
        });
      }
      updated.push(serializePlan(plan));
    }

    const plans = await listPlans({ activeOnly: false });
    res.json({ plans: plans.map(serializePlan), updated });
  } catch (error) {
    console.error('Admin update plans error:', error);
    res.status(500).json({ error: 'Failed to update plans' });
  }
});

export default router;
