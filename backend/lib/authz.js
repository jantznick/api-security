/**
 * Org-scoped RBAC helpers (S3 minimum for members/invites).
 * Roles (D8): owner > admin > member > viewer
 */

import { getMembership } from './orgs.js';

export const ORG_ROLE_RANK = Object.freeze({
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
});

export const ASSIGNABLE_ORG_ROLES = Object.freeze(['admin', 'member', 'viewer']);

export function isOrgRole(role) {
  return Object.prototype.hasOwnProperty.call(ORG_ROLE_RANK, role);
}

export function roleAtLeast(role, minRole) {
  const have = ORG_ROLE_RANK[role] ?? 0;
  const need = ORG_ROLE_RANK[minRole] ?? Infinity;
  return have >= need;
}

/**
 * Load membership or respond with 403/404.
 * @returns {Promise<object|null>} membership row, or null if response already sent
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

  if (!roleAtLeast(membership.role, minRole)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }

  return membership;
}

/** True if role can invite / change roles / remove members (owner or admin). */
export function canManageMembers(role) {
  return roleAtLeast(role, 'admin');
}
