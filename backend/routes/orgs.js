/**
 * Organization members, invites & custom roles.
 *
 * GET    /api/orgs/:orgId/members
 * PATCH  /api/orgs/:orgId/members/:userId
 * DELETE /api/orgs/:orgId/members/:userId
 * GET    /api/orgs/:orgId/invites
 * POST   /api/orgs/:orgId/invites
 * DELETE /api/orgs/:orgId/invites/:inviteId
 * GET    /api/orgs/:orgId/roles
 * POST   /api/orgs/:orgId/roles
 * PATCH  /api/orgs/:orgId/roles/:roleId
 * DELETE /api/orgs/:orgId/roles/:roleId
 */

import crypto from 'crypto';
import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  ASSIGNABLE_ORG_ROLES,
  canManageMembers,
  isOrgRole,
  isSystemOwner,
  membershipHasPermission,
  membershipRank,
  requireOrgMembership,
  requirePermission,
  serializeMembershipRole,
  systemRoleDefinitions,
} from '../lib/authz.js';
import {
  normalizePermissions,
  ORG_PERMISSION_LABELS,
  ORG_PERMISSIONS,
  SYSTEM_ROLE_META,
  SYSTEM_ROLE_PERMISSIONS,
} from '../lib/permissions.js';
import { getOrgSeatStatus, wouldExceedSeatLimit } from '../lib/seats.js';
import { hashApiKey } from '../lib/apiKeys.js';
import { isResendConfigured, sendOrgInviteEmail } from '../services/email/resend.js';

const router = express.Router({ mergeParams: true });

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z][a-z0-9_-]{1,47}$/;

router.use(requireAuth);

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function appBaseUrl() {
  const fromList = (process.env.FRONTEND_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const preferred =
    process.env.FRONTEND_URL?.trim() ||
    fromList.find((u) => u.includes('app.')) ||
    fromList[0] ||
    'http://localhost:5173';
  return preferred.replace(/\/$/, '');
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

function slugifyRoleKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function countOwners(organizationId) {
  return prisma.membership.count({
    where: { organizationId, role: 'owner', customRoleId: null },
  });
}

/**
 * Resolve invite/member role assignment from body.
 * Accepts { role: 'admin'|'member'|'viewer' } or { customRoleId } or { roleRef: 'custom:<id>' }.
 * @returns {Promise<{ ok: true, role: string, customRoleId: null|string, customRole?: object } | { ok: false, status: number, error: string }>}
 */
async function resolveRoleAssignment(orgId, body, { allowOwner = false, actor = null } = {}) {
  let customRoleId = body?.customRoleId ? String(body.customRoleId).trim() : null;
  let role = body?.role != null ? String(body.role).trim() : null;
  const roleRef = body?.roleRef != null ? String(body.roleRef).trim() : null;

  if (roleRef) {
    if (roleRef.startsWith('custom:')) {
      customRoleId = roleRef.slice('custom:'.length);
      role = null;
    } else {
      role = roleRef;
      customRoleId = null;
    }
  }

  if (customRoleId) {
    const customRole = await prisma.orgRoleDefinition.findFirst({
      where: {
        id: customRoleId,
        organizationId: orgId,
        isSystem: false,
      },
    });
    if (!customRole) {
      return { ok: false, status: 400, error: 'Custom role not found in this organization' };
    }
    // Store member as enum placeholder; authz uses customRoleId.
    return { ok: true, role: 'member', customRoleId: customRole.id, customRole };
  }

  if (!role) {
    role = 'member';
  }

  if (role === 'owner') {
    if (!allowOwner) {
      return { ok: false, status: 400, error: 'Cannot assign owner via this action' };
    }
    if (!isSystemOwner(actor)) {
      return { ok: false, status: 403, error: 'Only an owner can transfer ownership' };
    }
    return { ok: true, role: 'owner', customRoleId: null };
  }

  if (!ASSIGNABLE_ORG_ROLES.includes(role) && !(allowOwner && isOrgRole(role))) {
    return { ok: false, status: 400, error: 'Invalid role' };
  }

  // Admins (and custom manage_members without being owner) cannot assign system admin.
  if (role === 'admin' && actor && !isSystemOwner(actor)) {
    return { ok: false, status: 403, error: 'Only an owner can assign the admin role' };
  }

  return { ok: true, role, customRoleId: null };
}

function serializeMember(m) {
  const roleInfo = serializeMembershipRole(m);
  return {
    id: m.id,
    userId: m.userId,
    role: roleInfo.role ?? m.role,
    customRoleId: roleInfo.customRoleId,
    roleKey: roleInfo.roleKey,
    roleName: roleInfo.roleName,
    roleRef: roleInfo.roleRef,
    isSystemRole: roleInfo.isSystemRole,
    createdAt: m.createdAt,
    email: m.user.email,
    displayName: m.user.displayName,
  };
}

function serializeInvite(inv) {
  const roleName = inv.customRole?.name
    || (inv.role && SYSTEM_ROLE_META[inv.role]?.name)
    || inv.role;
  return {
    id: inv.id,
    email: inv.email,
    role: inv.customRoleId ? null : inv.role,
    customRoleId: inv.customRoleId || null,
    roleKey: inv.customRoleId ? inv.customRole?.key || null : inv.role,
    roleName,
    roleRef: inv.customRoleId ? `custom:${inv.customRoleId}` : inv.role,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    invitedBy: inv.invitedBy
      ? {
          id: inv.invitedBy.id,
          email: inv.invitedBy.email,
          displayName: inv.invitedBy.displayName,
        }
      : undefined,
  };
}

function serializeCustomRole(row, memberCount = 0) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || null,
    isSystem: false,
    organizationId: row.organizationId,
    permissions: normalizePermissions(row.permissions),
    memberCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * GET /api/orgs/:orgId/members
 */
router.get('/:orgId/members', async (req, res) => {
  try {
    const { orgId } = req.params;
    const membership = await requireOrgMembership(req, res, orgId, 'viewer');
    if (!membership) return;

    const [members, seats, org] = await Promise.all([
      prisma.membership.findMany({
        where: { organizationId: orgId },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          customRole: {
            select: { id: true, key: true, name: true, permissions: true, isSystem: true },
          },
        },
      }),
      getOrgSeatStatus(orgId),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, slug: true, isPersonal: true, planSlug: true },
      }),
    ]);

    const meRole = serializeMembershipRole(membership);

    res.json({
      organization: org,
      members: members.map(serializeMember),
      seats: {
        used: seats?.memberCount ?? members.length,
        pendingInvites: seats?.pendingInvites ?? 0,
        reserved: seats?.used ?? members.length,
        limit: seats?.limit ?? null,
        planSlug: seats?.planSlug ?? org?.planSlug ?? 'free',
      },
      me: {
        userId: req.session.userId,
        role: meRole.role ?? membership.role,
        customRoleId: meRole.customRoleId,
        roleKey: meRole.roleKey,
        roleName: meRole.roleName,
        roleRef: meRole.roleRef,
        permissions: meRole.permissions,
        canManageMembers: canManageMembers(membership),
        canManageRoles: membershipHasPermission(membership, 'org.manage_roles'),
      },
    });
  } catch (error) {
    console.error('List org members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/**
 * PATCH /api/orgs/:orgId/members/:userId — change role (manage_members).
 */
router.patch('/:orgId/members/:userId', async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const actor = await requirePermission(req, res, orgId, 'org.manage_members');
    if (!actor) return;

    const assignment = await resolveRoleAssignment(orgId, req.body, {
      allowOwner: true,
      actor,
    });
    if (!assignment.ok) {
      return res.status(assignment.status).json({ error: assignment.error });
    }

    const target = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: {
        customRole: { select: { id: true, key: true, name: true, permissions: true } },
      },
    });
    if (!target) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Cannot change peers at admin+ unless you are system owner.
    if (!isSystemOwner(actor) && membershipRank(target) >= ORG_ROLE_RANK_ADMIN) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (isSystemOwner(target) && !(assignment.role === 'owner' && !assignment.customRoleId)) {
      const owners = await countOwners(orgId);
      if (owners <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last owner' });
      }
    }

    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: {
        role: assignment.role,
        customRoleId: assignment.customRoleId,
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        customRole: {
          select: { id: true, key: true, name: true, permissions: true, isSystem: true },
        },
      },
    });

    res.json({ member: serializeMember(updated) });
  } catch (error) {
    console.error('Patch org member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

const ORG_ROLE_RANK_ADMIN = 3;

/**
 * DELETE /api/orgs/:orgId/members/:userId — remove member (manage_members).
 * Members may leave themselves (except last owner).
 */
router.delete('/:orgId/members/:userId', async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const isSelf = userId === req.session.userId;

    let actor;
    if (isSelf) {
      actor = await requireOrgMembership(req, res, orgId, 'viewer');
    } else {
      actor = await requirePermission(req, res, orgId, 'org.manage_members');
    }
    if (!actor) return;

    const target = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: {
        customRole: { select: { id: true } },
      },
    });
    if (!target) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (!isSelf) {
      if (!isSystemOwner(actor) && membershipRank(target) >= ORG_ROLE_RANK_ADMIN) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    if (isSystemOwner(target)) {
      const owners = await countOwners(orgId);
      if (owners <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last owner' });
      }
    }

    await prisma.membership.delete({ where: { id: target.id } });
    res.status(204).send();
  } catch (error) {
    console.error('Remove org member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/**
 * GET /api/orgs/:orgId/invites — pending invites (any member can view).
 */
router.get('/:orgId/invites', async (req, res) => {
  try {
    const { orgId } = req.params;
    const membership = await requireOrgMembership(req, res, orgId, 'viewer');
    if (!membership) return;

    const now = new Date();
    const invites = await prisma.orgInvite.findMany({
      where: {
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: { select: { id: true, email: true, displayName: true } },
        customRole: { select: { id: true, key: true, name: true } },
      },
    });

    res.json({
      invites: invites.map(serializeInvite),
      canManage: canManageMembers(membership),
    });
  } catch (error) {
    console.error('List org invites error:', error);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

/**
 * POST /api/orgs/:orgId/invites — { email, role | customRoleId } (manage_members).
 */
router.post('/:orgId/invites', async (req, res) => {
  try {
    const { orgId } = req.params;
    const actor = await requirePermission(req, res, orgId, 'org.manage_members');
    if (!actor) return;

    const email = normalizeEmail(req.body?.email);
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const assignment = await resolveRoleAssignment(orgId, req.body, {
      allowOwner: false,
      actor,
    });
    if (!assignment.ok) {
      return res.status(assignment.status).json({ error: assignment.error });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, planSlug: true },
    });
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const existingMember = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        memberships: {
          where: { organizationId: orgId },
          select: { id: true },
        },
      },
    });
    if (existingMember?.memberships?.length) {
      return res.status(409).json({ error: 'That user is already a member' });
    }

    const now = new Date();
    const existingInvite = await prisma.orgInvite.findFirst({
      where: {
        organizationId: orgId,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (existingInvite) {
      return res.status(409).json({ error: 'An invite is already pending for that email' });
    }

    const seats = await getOrgSeatStatus(orgId);
    if (wouldExceedSeatLimit(seats.used, seats.limit, 1)) {
      return res.status(403).json({
        error: `Seat limit reached (${seats.limit}). Upgrade your plan or remove a member before inviting.`,
        seats: {
          used: seats.memberCount,
          pendingInvites: seats.pendingInvites,
          reserved: seats.used,
          limit: seats.limit,
        },
      });
    }

    const rawToken = generateInviteToken();
    const tokenHash = hashApiKey(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await prisma.orgInvite.create({
      data: {
        organizationId: orgId,
        email,
        role: assignment.role,
        customRoleId: assignment.customRoleId,
        tokenHash,
        invitedById: req.session.userId,
        expiresAt,
      },
      include: {
        customRole: { select: { id: true, key: true, name: true } },
      },
    });

    const inviteUrl = `${appBaseUrl()}/invites/${rawToken}`;
    let emailSent = false;
    let emailSkipped = !isResendConfigured();

    const inviter = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { email: true, displayName: true },
    });

    const roleLabelForEmail =
      assignment.customRole?.name ||
      SYSTEM_ROLE_META[assignment.role]?.name ||
      assignment.role;

    try {
      const result = await sendOrgInviteEmail({
        to: email,
        inviteUrl,
        organizationName: org.name,
        inviterName: inviter?.displayName || inviter?.email || 'A teammate',
        role: roleLabelForEmail,
        expiresDays: Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000)),
      });
      emailSent = !result?.skipped;
      emailSkipped = Boolean(result?.skipped);
    } catch (emailError) {
      console.error('Failed to send org invite email:', emailError);
      if (process.env.NODE_ENV === 'production' && isResendConfigured()) {
        emailSent = false;
      }
    }

    if (process.env.NODE_ENV !== 'production' || emailSkipped) {
      console.log('\n=== ORG INVITE ===');
      console.log(`Org: ${org.name} (${orgId})`);
      console.log(`Email: ${email}`);
      console.log(`Role: ${roleLabelForEmail}`);
      console.log(`Invite URL: ${inviteUrl}`);
      console.log(`Expires: ${expiresAt.toISOString()}`);
      console.log('==================\n');
    }

    const payload = {
      invite: serializeInvite(invite),
      emailSent,
      emailSkipped,
    };

    if (emailSkipped || process.env.NODE_ENV !== 'production') {
      payload.inviteUrl = inviteUrl;
    } else if (!emailSent) {
      payload.inviteUrl = inviteUrl;
    }

    res.status(201).json(payload);
  } catch (error) {
    console.error('Create org invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

/**
 * DELETE /api/orgs/:orgId/invites/:inviteId — revoke pending invite.
 */
router.delete('/:orgId/invites/:inviteId', async (req, res) => {
  try {
    const { orgId, inviteId } = req.params;
    const actor = await requirePermission(req, res, orgId, 'org.manage_members');
    if (!actor) return;

    const invite = await prisma.orgInvite.findFirst({
      where: { id: inviteId, organizationId: orgId },
    });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.acceptedAt) {
      return res.status(400).json({ error: 'Invite already accepted' });
    }
    if (invite.revokedAt) {
      return res.status(204).send();
    }

    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Revoke org invite error:', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

/**
 * GET /api/orgs/:orgId/roles — system + custom roles for the org.
 */
router.get('/:orgId/roles', async (req, res) => {
  try {
    const { orgId } = req.params;
    const membership = await requireOrgMembership(req, res, orgId, 'viewer');
    if (!membership) return;

    const customRows = await prisma.orgRoleDefinition.findMany({
      where: { organizationId: orgId, isSystem: false },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    const system = systemRoleDefinitions().map((r) => ({
      ...r,
      permissions: [...SYSTEM_ROLE_PERMISSIONS[r.key]],
    }));

    res.json({
      roles: [
        ...system,
        ...customRows.map((r) => serializeCustomRole(r, r._count.memberships)),
      ],
      permissions: ORG_PERMISSIONS.map((key) => ({
        key,
        label: ORG_PERMISSION_LABELS[key] || key,
      })),
      me: {
        canManageRoles: membershipHasPermission(membership, 'org.manage_roles'),
        canManageMembers: canManageMembers(membership),
      },
    });
  } catch (error) {
    console.error('List org roles error:', error);
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

/**
 * POST /api/orgs/:orgId/roles — create custom role (manage_roles).
 */
router.post('/:orgId/roles', async (req, res) => {
  try {
    const { orgId } = req.params;
    const actor = await requirePermission(req, res, orgId, 'org.manage_roles');
    if (!actor) return;

    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Name is required (max 80 characters)' });
    }

    let key = String(req.body?.key || '').trim().toLowerCase() || slugifyRoleKey(name);
    if (!SLUG_RE.test(key)) {
      return res.status(400).json({
        error: 'Key must be 2–48 chars: start with a letter, then lowercase letters, digits, _ or -',
      });
    }
    if (isOrgRole(key)) {
      return res.status(400).json({ error: 'Cannot reuse a system role key' });
    }

    const description =
      req.body?.description != null ? String(req.body.description).trim().slice(0, 280) : null;
    const permissions = normalizePermissions(req.body?.permissions);

    // Custom roles must not include org.manage_billing unless actor is owner
    // (billing stays owner-gated until S5).
    if (permissions.includes('org.manage_billing') && !isSystemOwner(actor)) {
      return res.status(403).json({ error: 'Only an owner can grant billing permission' });
    }

    const existing = await prisma.orgRoleDefinition.findFirst({
      where: { organizationId: orgId, key },
    });
    if (existing) {
      return res.status(409).json({ error: 'A role with that key already exists' });
    }

    const row = await prisma.orgRoleDefinition.create({
      data: {
        organizationId: orgId,
        key,
        name,
        description: description || null,
        isSystem: false,
        permissions,
      },
    });

    res.status(201).json({ role: serializeCustomRole(row, 0) });
  } catch (error) {
    console.error('Create org role error:', error);
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'A role with that key already exists' });
    }
    res.status(500).json({ error: 'Failed to create role' });
  }
});

/**
 * PATCH /api/orgs/:orgId/roles/:roleId — update custom role.
 */
router.patch('/:orgId/roles/:roleId', async (req, res) => {
  try {
    const { orgId, roleId } = req.params;
    const actor = await requirePermission(req, res, orgId, 'org.manage_roles');
    if (!actor) return;

    const existing = await prisma.orgRoleDefinition.findFirst({
      where: { id: roleId, organizationId: orgId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Role not found' });
    }
    if (existing.isSystem) {
      return res.status(400).json({ error: 'System roles cannot be edited' });
    }

    const data = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 80) {
        return res.status(400).json({ error: 'Name is required (max 80 characters)' });
      }
      data.name = name;
    }
    if (req.body?.description !== undefined) {
      data.description =
        req.body.description == null
          ? null
          : String(req.body.description).trim().slice(0, 280) || null;
    }
    if (req.body?.permissions != null) {
      const permissions = normalizePermissions(req.body.permissions);
      if (permissions.includes('org.manage_billing') && !isSystemOwner(actor)) {
        return res.status(403).json({ error: 'Only an owner can grant billing permission' });
      }
      data.permissions = permissions;
    }
    // key is immutable after create to keep invites/refs stable

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    const row = await prisma.orgRoleDefinition.update({
      where: { id: existing.id },
      data,
    });

    res.json({
      role: serializeCustomRole(row, existing._count.memberships),
    });
  } catch (error) {
    console.error('Patch org role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/orgs/:orgId/roles/:roleId — delete custom role (blocked if members assigned).
 */
router.delete('/:orgId/roles/:roleId', async (req, res) => {
  try {
    const { orgId, roleId } = req.params;
    const actor = await requirePermission(req, res, orgId, 'org.manage_roles');
    if (!actor) return;

    const existing = await prisma.orgRoleDefinition.findFirst({
      where: { id: roleId, organizationId: orgId },
      include: {
        _count: {
          select: { memberships: true, invites: true },
        },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Role not found' });
    }
    if (existing.isSystem) {
      return res.status(400).json({ error: 'System roles cannot be deleted' });
    }

    if (existing._count.memberships > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${existing._count.memberships} member(s) still assigned. Reassign them first.`,
        memberCount: existing._count.memberships,
      });
    }

    // Revoke pending invites that reference this role so FK does not block delete.
    if (existing._count.invites > 0) {
      await prisma.orgInvite.updateMany({
        where: {
          customRoleId: existing.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      // Clear FK on any remaining (accepted/revoked) invites
      await prisma.orgInvite.updateMany({
        where: { customRoleId: existing.id },
        data: { customRoleId: null },
      });
    }

    await prisma.orgRoleDefinition.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete org role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

export default router;
