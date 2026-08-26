/**
 * Org-scoped RBAC helpers.
 * System roles: owner > admin > member > viewer (built-in, not deletable).
 * Custom roles: per-org OrgRoleDefinition rows with a permissions Json array.
 */

import { getMembership } from './orgs.js';
import {
  ASSIGNABLE_SYSTEM_ROLES,
  isSystemRoleKey,
  membershipHasPermission,
  membershipRoleLabel,
  membershipRoleRef,
  permissionsForMembership,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_META,
  SYSTEM_ROLE_PERMISSIONS,
} from './permissions.js';

/** @deprecated Prefer permission checks; kept for rank comparisons among system roles. */
export const ORG_ROLE_RANK = Object.freeze({
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
});

export const ASSIGNABLE_ORG_ROLES = ASSIGNABLE_SYSTEM_ROLES;

export function isOrgRole(role) {
  return isSystemRoleKey(role);
}

export function roleAtLeast(role, minRole) {
  const have = ORG_ROLE_RANK[role] ?? 0;
  const need = ORG_ROLE_RANK[minRole] ?? Infinity;
  return have >= need;
}

/**
 * Effective rank for peer comparisons. Custom roles sit below admin
 * (cannot manage owners/admins unless they are system owner).
 */
export function membershipRank(membership) {
  if (!membership) return 0;
  if (membership.customRoleId) {
    // Custom roles never outrank system admin/owner for peer protection.
    return ORG_ROLE_RANK.member;
  }
  return ORG_ROLE_RANK[membership.role] ?? 0;
}

export function isSystemOwner(membership) {
  return Boolean(membership && !membership.customRoleId && membership.role === 'owner');
}

export function isSystemAdminOrOwner(membership) {
  if (!membership || membership.customRoleId) return false;
  return membership.role === 'owner' || membership.role === 'admin';
}

/**
 * Load membership (with custom role) or respond with 403/404.
 * minRole still works for system-role rank checks; prefer requirePermission.
 * @returns {Promise<object|null>}
 */
export async function requireOrgMembership(req, res, organizationId, minRole = 'viewer') {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const membership = await getMembership(organizationId, userId);
  if (!membership) {
    res.status(404).json({ error: 'Organization not found' });
    return null;
  }

  // System-role floor: custom roles always satisfy viewer; for higher floors
  // require the matching permission or system rank.
  if (minRole === 'viewer') {
    return membership;
  }

  if (membership.customRoleId) {
    // Map legacy minRole floors onto permission checks for custom roles.
    const needed =
      minRole === 'admin'
        ? 'org.manage_members'
        : minRole === 'member'
          ? 'project.create'
          : null;
    if (needed && !membershipHasPermission(membership, needed)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return null;
    }
    return membership;
  }

  if (!roleAtLeast(membership.role, minRole)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }

  return membership;
}

/**
 * Require a specific permission flag on the actor's membership.
 * @returns {Promise<object|null>}
 */
export async function requirePermission(req, res, organizationId, permission) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const membership = await getMembership(organizationId, userId);
  if (!membership) {
    res.status(404).json({ error: 'Organization not found' });
    return null;
  }

  if (!membershipHasPermission(membership, permission)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }

  return membership;
}

/** True if membership can invite / change roles / remove members. */
export function canManageMembers(membershipOrRole) {
  if (membershipOrRole && typeof membershipOrRole === 'object') {
    return membershipHasPermission(membershipOrRole, 'org.manage_members');
  }
  // Legacy: bare role string
  return roleAtLeast(membershipOrRole, 'admin');
}

export function canManageRoles(membership) {
  return membershipHasPermission(membership, 'org.manage_roles');
}

export function serializeMembershipRole(membership) {
  return {
    role: membership.customRoleId ? null : membership.role,
    customRoleId: membership.customRoleId || null,
    roleKey: membership.customRoleId
      ? membership.customRole?.key || null
      : membership.role,
    roleName: membershipRoleLabel(membership),
    roleRef: membershipRoleRef(membership),
    isSystemRole: !membership.customRoleId,
    permissions: permissionsForMembership(membership),
  };
}

export function systemRoleDefinitions() {
  return SYSTEM_ROLE_KEYS.map((key) => ({
    id: null,
    key,
    name: SYSTEM_ROLE_META[key].name,
    description: SYSTEM_ROLE_META[key].description,
    isSystem: true,
    organizationId: null,
    permissions: [...SYSTEM_ROLE_PERMISSIONS[key]],
    memberCount: null,
  }));
}

export {
  membershipHasPermission,
  permissionsForMembership,
  membershipRoleLabel,
  membershipRoleRef,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_META,
  ASSIGNABLE_SYSTEM_ROLES,
};
