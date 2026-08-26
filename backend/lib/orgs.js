/**
 * Personal organization helpers (S2).
 * Every user always has a personal org + owner membership + Default project.
 */

import prisma from './prisma.js';

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
  const planSlug = user.planSlug || 'free';

  const organization = await prisma.organization.create({
    data: {
      name: personalOrgName(user.email),
      slug,
      isPersonal: true,
      planSlug,
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
 * Membership check: user can access this organization.
 */
export async function getMembership(organizationId, userId) {
  return prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
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
