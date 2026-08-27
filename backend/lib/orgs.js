/**
 * Personal organization helpers (S2).
 * Every user always has a personal org + owner membership + Default project.
 * New personal orgs snapshot plan limits from the catalog Plan (not live-linked).
 * Team orgs are created explicitly via createTeamOrganization.
 */

import prisma from './prisma.js';
import { getPlanBySlug, DEFAULT_PLAN_SLUG } from './plans.js';
import { normalizeOrgSlugCandidate } from './orgSlug.js';

export { slugifyOrgName } from './orgSlug.js';

function personalSlug(userId) {
  return `personal-${String(userId).replace(/-/g, '')}`;
}

function personalOrgName(email) {
  const local = String(email || '')
    .split('@')[0]
    ?.trim();
  if (local) return `${local}'s workspace`;
  return 'Personal workspace';
}

/**
 * Ensure slug starts with a letter and is unique. Appends -2, -3, … if needed.
 * @param {string} base
 * @returns {Promise<string>}
 */
export async function allocateOrgSlug(base) {
  const candidate = normalizeOrgSlugCandidate(base);

  for (let n = 0; n < 50; n += 1) {
    const slug = n === 0 ? candidate : `${candidate.slice(0, 44)}-${n + 1}`.slice(0, 48);
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  return `org-${Date.now().toString(36)}`;
}

/**
 * Ensure the user has a personal Organization, owner Membership, and a Default Project.
 * Idempotent. Mirrors planSlug / stripeSubscriptionId onto the org (not stripeCustomerId — unique on User until S5).
 *
 * @param {{ id: string, email?: string, planSlug?: string, stripeSubscriptionId?: string | null }} user
 * @returns {Promise<{ organization: object, project: object, created: boolean }>}
 */
export async function ensurePersonalOrg(user) {
  if (!user?.id) {
    throw new Error('ensurePersonalOrg requires user.id');
  }

  const existing = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      organization: { isPersonal: true },
    },
    include: {
      organization: {
        include: {
          projects: { orderBy: { createdAt: 'asc' }, take: 1 },
        },
      },
    },
  });

  if (existing?.organization) {
    let project = existing.organization.projects[0];
    if (!project) {
      project = await prisma.project.create({
        data: {
          organizationId: existing.organization.id,
          name: 'Default',
        },
      });
    }
    return { organization: existing.organization, project, created: false };
  }

  const slug = personalSlug(user.id);
  const planSlug = user.planSlug || DEFAULT_PLAN_SLUG;
  const plan = await getPlanBySlug(planSlug);
  const endpointLimit = plan.endpointLimit ?? null;
  const seatLimit = plan.seatLimit ?? null;
  const planAssignedAt = new Date();

  const organization = await prisma.organization.create({
    data: {
      name: personalOrgName(user.email),
      slug,
      isPersonal: true,
      planSlug,
      endpointLimit,
      seatLimit,
      planAssignedAt,
      stripeSubscriptionId: user.stripeSubscriptionId ?? null,
      memberships: {
        create: {
          userId: user.id,
          role: 'owner',
        },
      },
      projects: {
        create: {
          name: 'Default',
        },
      },
    },
    include: {
      projects: { orderBy: { createdAt: 'asc' }, take: 1 },
      memberships: true,
    },
  });

  return {
    organization,
    project: organization.projects[0],
    created: true,
  };
}

/**
 * Default project for the user's personal org (creates org/project if needed).
 */
export async function getPersonalDefaultProject(user) {
  const { project } = await ensurePersonalOrg(user);
  return project;
}

/**
 * Create a non-personal (team) organization with the user as owner + Default project.
 * Snapshots free-plan limits from the catalog (billing stays user-level until S5).
 *
 * @param {{ id: string, email?: string, planSlug?: string }} user
 * @param {{ name: string, slug?: string }} opts
 * @returns {Promise<{ organization: object, project: object }>}
 */
export async function createTeamOrganization(user, { name, slug: requestedSlug } = {}) {
  if (!user?.id) {
    throw new Error('createTeamOrganization requires user.id');
  }

  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > 80) {
    const err = new Error('Name is required (max 80 characters)');
    err.status = 400;
    throw err;
  }

  const slug = requestedSlug
    ? await allocateOrgSlug(requestedSlug)
    : await allocateOrgSlug(trimmed);

  // Team orgs start on free entitlements until org billing (S5).
  const planSlug = DEFAULT_PLAN_SLUG;
  const plan = await getPlanBySlug(planSlug);
  const endpointLimit = plan.endpointLimit ?? null;
  const seatLimit = plan.seatLimit ?? null;
  const planAssignedAt = new Date();

  const organization = await prisma.organization.create({
    data: {
      name: trimmed,
      slug,
      isPersonal: false,
      planSlug,
      endpointLimit,
      seatLimit,
      planAssignedAt,
      memberships: {
        create: {
          userId: user.id,
          role: 'owner',
        },
      },
      projects: {
        create: {
          name: 'Default',
        },
      },
    },
    include: {
      projects: { orderBy: { createdAt: 'asc' }, take: 1 },
      memberships: true,
      _count: { select: { memberships: true } },
    },
  });

  return {
    organization,
    project: organization.projects[0],
  };
}

/**
 * Ensure an org has at least one project named Default (or the oldest project).
 */
export async function ensureOrgDefaultProject(organizationId) {
  const existing = await prisma.project.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;
  return prisma.project.create({
    data: { organizationId, name: 'Default' },
  });
}

/**
 * Membership check: user can access this organization.
 * Includes customRole when assigned (for permission resolution).
 */
export async function getMembership(organizationId, userId) {
  return prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    include: {
      customRole: {
        select: {
          id: true,
          key: true,
          name: true,
          permissions: true,
          isSystem: true,
          organizationId: true,
        },
      },
    },
  });
}

/**
 * Find a project the user can access via org membership.
 */
export async function accessibleProject(projectId, userId) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      organization: {
        memberships: { some: { userId } },
      },
    },
    include: {
      organization: { select: { id: true, name: true, slug: true, isPersonal: true } },
    },
  });
}

/**
 * Find a service the user can access via Project → Org → Membership.
 */
export async function accessibleService(serviceId, userId) {
  return prisma.service.findFirst({
    where: {
      id: serviceId,
      project: {
        organization: {
          memberships: { some: { userId } },
        },
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true, isPersonal: true } },
        },
      },
      apiKeys: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      },
      _count: { select: { endpoints: true } },
    },
  });
}

/**
 * Org ids the user belongs to.
 */
export async function memberOrgIds(userId) {
  const rows = await prisma.membership.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  return rows.map((r) => r.organizationId);
}
