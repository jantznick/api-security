/**
 * Org permission catalog + built-in role → permission mapping.
 * Single source of truth for system roles (owner | admin | member | viewer).
 */

/** All known permission flags (string list model). */
export const ORG_PERMISSIONS = Object.freeze([
  'org.manage_members',
  'org.manage_roles',
  'org.manage_settings',
  'org.manage_billing',
  'project.create',
  'project.manage',
  'service.create',
  'service.manage',
  'service.manage_keys',
  'inventory.read',
  'inventory.export',
]);

export const ORG_PERMISSION_SET = new Set(ORG_PERMISSIONS);

/** Human-readable labels for UI checkboxes. */
export const ORG_PERMISSION_LABELS = Object.freeze({
  'org.manage_members': 'Invite, remove, and change member roles',
  'org.manage_roles': 'Create and edit custom roles',
  'org.manage_settings': 'Rename organization and manage settings',
  'org.manage_billing': 'Manage billing and subscription',
  'project.create': 'Create projects',
  'project.manage': 'Rename and manage projects',
  'service.create': 'Create services',
  'service.manage': 'Rename and manage services',
  'service.manage_keys': 'Create and revoke API keys',
  'inventory.read': 'View inventory and endpoint detail',
  'inventory.export': 'Export OpenAPI / inventory',
});

const ALL = Object.freeze([...ORG_PERMISSIONS]);

/**
 * Built-in role permissions. Owner keeps special non-permission rules
 * (transfer ownership, delete org, last-owner) in route handlers.
 */
export const SYSTEM_ROLE_PERMISSIONS = Object.freeze({
  owner: ALL,
  admin: Object.freeze([
    'org.manage_members',
    'org.manage_roles',
    'org.manage_settings',
    // billing stays owner-only until S5 moves Stripe to org
    'project.create',
    'project.manage',
    'service.create',
    'service.manage',
    'service.manage_keys',
    'inventory.read',
    'inventory.export',
  ]),
  member: Object.freeze([
    'project.create',
    'project.manage',
    'service.create',
    'service.manage',
    'service.manage_keys',
    'inventory.read',
    'inventory.export',
  ]),
  viewer: Object.freeze(['inventory.read', 'inventory.export']),
});

export const SYSTEM_ROLE_KEYS = Object.freeze(['owner', 'admin', 'member', 'viewer']);

export const SYSTEM_ROLE_META = Object.freeze({
  owner: { name: 'Owner', description: 'Full control including ownership transfer and billing' },
  admin: { name: 'Admin', description: 'Manage members, roles, and all project/service work' },
  member: { name: 'Member', description: 'Create and manage projects, services, and keys' },
  viewer: { name: 'Viewer', description: 'Read-only inventory access' },
});

/** Roles that may be assigned via invite / role change (not owner). */
export const ASSIGNABLE_SYSTEM_ROLES = Object.freeze(['admin', 'member', 'viewer']);

export function isSystemRoleKey(key) {
  return Object.prototype.hasOwnProperty.call(SYSTEM_ROLE_PERMISSIONS, key);
}

export function isKnownPermission(perm) {
  return ORG_PERMISSION_SET.has(perm);
}

/**
 * Normalize a permissions payload to a sorted unique list of known flags.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizePermissions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const p = String(item || '').trim();
    if (!p || !isKnownPermission(p) || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  out.sort();
  return out;
}

/**
 * Resolve effective permissions for a membership row.
 * Custom role wins when customRoleId is set; otherwise system role mapping.
 *
 * @param {{ role?: string, customRole?: { permissions?: unknown } | null }} membership
 * @returns {string[]}
 */
export function permissionsForMembership(membership) {
  if (membership?.customRoleId && membership?.customRole) {
    return normalizePermissions(membership.customRole.permissions);
  }
  const key = membership?.role;
  if (isSystemRoleKey(key)) {
    return [...SYSTEM_ROLE_PERMISSIONS[key]];
  }
  return [];
}

export function membershipHasPermission(membership, permission) {
  if (!isKnownPermission(permission)) return false;
  return permissionsForMembership(membership).includes(permission);
}

/** Display label for a membership assignment. */
export function membershipRoleLabel(membership) {
  if (membership?.customRole?.name) return membership.customRole.name;
  const key = membership?.role;
  if (isSystemRoleKey(key)) return SYSTEM_ROLE_META[key].name;
  return key || '—';
}

/** Stable assignment key for API/UI: system key or `custom:<id>`. */
export function membershipRoleRef(membership) {
  if (membership?.customRoleId) {
    return `custom:${membership.customRoleId}`;
  }
  return membership?.role || null;
}
