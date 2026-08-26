/**
 * Platform-admin user directory helpers: detail, org memberships, delete.
 */

import prisma from './prisma.js';
import { isAdminEmail } from './admin.js';
import { isOrgRole, serializeMembershipRole } from './authz.js';
import { SYSTEM_ROLE_KEYS } from './permissions.js';

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

const membershipDetailSelect = {
  id: true,
  role: true,
  customRoleId: true,
  createdAt: true,
  customRole: {
    select: { id: true, key: true, name: true },
  },
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      isPersonal: true,
      planSlug: true,
      _count: { select: { memberships: true, projects: true } },
      projects: {
        select: {
          id: true,
          _count: { select: { services: true } },
        },
      },
    },
  },
};

function serializeOrgMembership(m) {
  const roleInfo = serializeMembershipRole(m);
  const projectCount = m.organization?.projects?.length ?? m.organization?._count?.projects ?? 0;
  let serviceCount = 0;
  for (const p of m.organization?.projects || []) {
    serviceCount += p._count?.services ?? 0;
  }
  return {
    membershipId: m.id,
    organizationId: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    isPersonal: Boolean(m.organization.isPersonal),
    planSlug: m.organization.planSlug,
    memberCount: m.organization._count?.memberships ?? null,
    projectCount,
    serviceCount,
    role: roleInfo.role ?? m.role,
    customRoleId: roleInfo.customRoleId,
    roleKey: roleInfo.roleKey,
    roleName: roleInfo.roleName,
    roleRef: roleInfo.roleRef,
    isSystemRole: roleInfo.isSystemRole,
    joinedAt: m.createdAt,
  };
}

async function countSystemOwners(organizationId) {
  return prisma.membership.count({
    where: { organizationId, role: 'owner', customRoleId: null },
  });
}

function isSystemOwner(membership) {
  return Boolean(membership && !membership.customRoleId && membership.role === 'owner');
}

/**
 * Enrich list rows with org summaries (keeps directory usable).
 */
export function withOrgSummary(userRow, memberships) {
  const orgs = (memberships || []).map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    isPersonal: Boolean(m.organization.isPersonal),
    roleKey: m.customRoleId
      ? m.customRole?.key || 'custom'
      : m.role,
    roleName: m.customRoleId
      ? m.customRole?.name || 'Custom'
      : m.role,
  }));
  return {
    ...userRow,
    orgCount: orgs.length,
    orgs,
  };
}

export const listMembershipIncludeForSummary = {
  select: {
    role: true,
    customRoleId: true,
    customRole: { select: { key: true, name: true } },
    organization: {
      select: {
        id: true,
        name: true,
        isPersonal: true,
        projects: {
          select: {
            id: true,
            _count: { select: { services: true } },
          },
        },
      },
    },
  },
};

export function mapListedUser(u) {
  const base = {
    id: u.id,
    email: u.email,
    displayName: u.displayName ?? null,
    planSlug: u.planSlug,
    projectCount: countProjectsForUser(u.memberships),
    serviceCount: countServicesForUser(u.memberships),
    hasStripeCustomer: Boolean(u.stripeCustomerId),
    hasSubscription: Boolean(u.stripeSubscriptionId),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    isPlatformAdmin: isAdminEmail(u.email),
  };
  return withOrgSummary(base, u.memberships);
}

export async function getAdminUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      planSlug: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        orderBy: [{ organization: { isPersonal: 'desc' } }, { createdAt: 'asc' }],
        select: membershipDetailSelect,
      },
    },
  });
  if (!user) return null;

  const orgs = user.memberships.map(serializeOrgMembership);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    planSlug: user.planSlug,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    hasSubscription: Boolean(user.stripeSubscriptionId),
    stripeCustomerId: user.stripeCustomerId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isPlatformAdmin: isAdminEmail(user.email),
    projectCount: orgs.reduce((s, o) => s + o.projectCount, 0),
    serviceCount: orgs.reduce((s, o) => s + o.serviceCount, 0),
    orgCount: orgs.length,
    orgs,
    systemRoles: [...SYSTEM_ROLE_KEYS],
  };
}

/**
 * Platform admin sets a member's role in an org.
 * Body: { role: 'owner'|'admin'|'member'|'viewer' } or { customRoleId }
 */
export async function adminUpdateMembership(userId, organizationId, body = {}) {
  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    include: {
      customRole: { select: { id: true, key: true, name: true } },
      organization: { select: { id: true, name: true, isPersonal: true } },
    },
  });
  if (!membership) {
    const err = new Error('Membership not found');
    err.status = 404;
    throw err;
  }

  const customRoleId = body.customRoleId ? String(body.customRoleId).trim() : null;
  let role = body.role != null ? String(body.role).trim() : null;

  if (customRoleId) {
    const custom = await prisma.orgRoleDefinition.findFirst({
      where: { id: customRoleId, organizationId },
    });
    if (!custom) {
      const err = new Error('Custom role not found in this organization');
      err.status = 400;
      throw err;
    }
    if (isSystemOwner(membership)) {
      const owners = await countSystemOwners(organizationId);
      if (owners <= 1) {
        const err = new Error('Cannot remove the last owner — assign another owner first');
        err.status = 400;
        throw err;
      }
    }
    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { role: 'member', customRoleId: custom.id },
      select: membershipDetailSelect,
    });
    return serializeOrgMembership(updated);
  }

  if (!role || !isOrgRole(role)) {
    const err = new Error('Invalid role');
    err.status = 400;
    throw err;
  }

  if (isSystemOwner(membership) && role !== 'owner') {
    const owners = await countSystemOwners(organizationId);
    if (owners <= 1) {
      const err = new Error('Cannot demote the last owner');
      err.status = 400;
      throw err;
    }
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { role, customRoleId: null },
    select: membershipDetailSelect,
  });
  return serializeOrgMembership(updated);
}

/** Remove user from an org (platform admin). */
export async function adminRemoveMembership(userId, organizationId) {
  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    include: {
      organization: { select: { id: true, name: true, isPersonal: true } },
    },
  });
  if (!membership) {
    const err = new Error('Membership not found');
    err.status = 404;
    throw err;
  }

  if (membership.organization.isPersonal) {
    const err = new Error('Cannot remove a user from their personal organization');
    err.status = 400;
    throw err;
  }

  if (isSystemOwner(membership)) {
    const owners = await countSystemOwners(organizationId);
    if (owners <= 1) {
      const err = new Error('Cannot remove the last owner — assign another owner first');
      err.status = 400;
      throw err;
    }
  }

  await prisma.membership.delete({ where: { id: membership.id } });
  return { ok: true, organizationId, userId };
}

/**
 * Delete a user account. Personal orgs they solely own are deleted.
 * Team orgs where they are the last owner block deletion.
 */
export async function adminDeleteUser(userId, { actorUserId, actorEmail } = {}) {
  if (actorUserId && userId === actorUserId) {
    const err = new Error('You cannot delete your own account from Admin');
    err.status = 400;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      memberships: {
        select: {
          id: true,
          role: true,
          customRoleId: true,
          organizationId: true,
          organization: {
            select: { id: true, name: true, isPersonal: true },
          },
        },
      },
    },
  });

  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (isAdminEmail(user.email) || (actorEmail && isAdminEmail(user.email))) {
    const err = new Error('Cannot delete the platform admin account');
    err.status = 400;
    throw err;
  }

  const blockingOrgs = [];
  const personalOrgIds = [];

  for (const m of user.memberships) {
    if (m.organization.isPersonal) {
      personalOrgIds.push(m.organizationId);
      continue;
    }
    if (isSystemOwner(m)) {
      const owners = await countSystemOwners(m.organizationId);
      if (owners <= 1) {
        blockingOrgs.push({
          id: m.organization.id,
          name: m.organization.name,
        });
      }
    }
  }

  if (blockingOrgs.length) {
    const err = new Error(
      `Cannot delete: last owner of ${blockingOrgs.map((o) => o.name).join(', ')}. Transfer ownership first.`,
    );
    err.status = 400;
    err.blockingOrgs = blockingOrgs;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    if (personalOrgIds.length) {
      await tx.organization.deleteMany({
        where: { id: { in: personalOrgIds }, isPersonal: true },
      });
    }

    await tx.magicToken.deleteMany({ where: { email: user.email } });
    await tx.contactLead.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });

    // Remaining team memberships cascade from User delete
    await tx.user.delete({ where: { id: user.id } });
  });

  return { ok: true, id: user.id, email: user.email };
}

export { SYSTEM_ROLE_KEYS };
