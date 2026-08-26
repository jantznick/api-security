/**
 * Proof: catalog Plan edits do not cascade to org snapshotted limits.
 * Run: DATABASE_URL=... node scripts/prove-org-plan-snapshots.js
 */
import prisma from '../lib/prisma.js';
import {
  applyPlanToOrganization,
  applyPlanToUser,
  ensureDefaultPlans,
  resolveOrgEndpointLimit,
  resolveOrgSeatLimit,
} from '../lib/plans.js';
import { getOrgSeatStatus } from '../lib/seats.js';
import { ensurePersonalOrg } from '../lib/orgs.js';

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  await ensureDefaultPlans();

  const email = `snapshot-proof-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { email, planSlug: 'free' },
  });

  const { organization } = await ensurePersonalOrg(user);
  assert(organization.endpointLimit === 25, `new org endpointLimit expected 25, got ${organization.endpointLimit}`);
  assert(organization.seatLimit === 3, `new org seatLimit expected 3, got ${organization.seatLimit}`);
  assert(organization.planAssignedAt, 'new org must have planAssignedAt');

  // Assign free explicitly (same as catalog) then mutate catalog
  await applyPlanToUser(user.id, 'free');

  const before = await prisma.organization.findUnique({ where: { id: organization.id } });
  assert(before.endpointLimit === 25, 'before catalog edit: endpointLimit 25');
  assert(before.seatLimit === 3, 'before catalog edit: seatLimit 3');

  // Catalog-only edit (same as Admin PUT /plans) — must NOT touch orgs
  await prisma.plan.update({
    where: { slug: 'free' },
    data: { endpointLimit: 50, seatLimit: 10 },
  });

  const afterCatalog = await prisma.organization.findUnique({
    where: { id: organization.id },
  });
  assert(
    afterCatalog.endpointLimit === 25,
    `catalog edit cascaded endpointLimit: ${afterCatalog.endpointLimit}`,
  );
  assert(
    afterCatalog.seatLimit === 3,
    `catalog edit cascaded seatLimit: ${afterCatalog.seatLimit}`,
  );

  const resolvedEp = await resolveOrgEndpointLimit(afterCatalog);
  const resolvedSeat = await resolveOrgSeatLimit(afterCatalog);
  assert(resolvedEp === 25, `resolver endpoint after catalog edit: ${resolvedEp}`);
  assert(resolvedSeat === 3, `resolver seat after catalog edit: ${resolvedSeat}`);

  const seats = await getOrgSeatStatus(organization.id);
  assert(seats.limit === 3, `getOrgSeatStatus after catalog edit: ${seats.limit}`);

  // Live Plan must show new catalog values
  const catalog = await prisma.plan.findUnique({ where: { slug: 'free' } });
  assert(catalog.endpointLimit === 50, 'catalog endpoint should be 50');
  assert(catalog.seatLimit === 10, 'catalog seat should be 10');

  // Re-assign snapshots the NEW catalog onto the org
  await applyPlanToOrganization(organization.id, 'free');
  const afterAssign = await prisma.organization.findUnique({
    where: { id: organization.id },
  });
  assert(afterAssign.endpointLimit === 50, `re-assign endpoint: ${afterAssign.endpointLimit}`);
  assert(afterAssign.seatLimit === 10, `re-assign seat: ${afterAssign.seatLimit}`);

  // New signup after catalog bump gets new limits
  const email2 = `snapshot-proof-new-${Date.now()}@example.com`;
  const user2 = await prisma.user.create({
    data: { email: email2, planSlug: 'free' },
  });
  const { organization: org2 } = await ensurePersonalOrg(user2);
  assert(org2.endpointLimit === 50, `new signup endpoint: ${org2.endpointLimit}`);
  assert(org2.seatLimit === 10, `new signup seat: ${org2.seatLimit}`);

  // Restore Free catalog for other local tests
  await prisma.plan.update({
    where: { slug: 'free' },
    data: { endpointLimit: 25, seatLimit: 3 },
  });

  console.log('PASS: org plan snapshots — catalog edits do not cascade; re-assign does.');
}

main()
  .catch((err) => {
    console.error('FAIL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
