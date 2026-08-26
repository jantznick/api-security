/**
 * Organization members & invites (S4).
 *
 * GET    /api/orgs/:orgId/members
 * PATCH  /api/orgs/:orgId/members/:userId
 * DELETE /api/orgs/:orgId/members/:userId
 * GET    /api/orgs/:orgId/invites
 * POST   /api/orgs/:orgId/invites
 * DELETE /api/orgs/:orgId/invites/:inviteId
 */

import crypto from 'crypto';
import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  ASSIGNABLE_ORG_ROLES,
  canManageMembers,
  isOrgRole,
  requireOrgMembership,
  roleAtLeast,
} from '../lib/authz.js';
import { getOrgSeatStatus, wouldExceedSeatLimit } from '../lib/seats.js';
import { hashApiKey } from '../lib/apiKeys.js';
import { isResendConfigured, sendOrgInviteEmail } from '../services/email/resend.js';

const router = express.Router({ mergeParams: true });

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function countOwners(organizationId) {
  return prisma.membership.count({
    where: { organizationId, role: 'owner' },
  });
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
        },
      }),
      getOrgSeatStatus(orgId),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, slug: true, isPersonal: true, planSlug: true },
      }),
    ]);

    res.json({
      organization: org,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
        email: m.user.email,
        displayName: m.user.displayName,
      })),
      seats: {
        used: seats?.memberCount ?? members.length,
        pendingInvites: seats?.pendingInvites ?? 0,
        reserved: seats?.used ?? members.length,
        limit: seats?.limit ?? null,
        planSlug: seats?.planSlug ?? org?.planSlug ?? 'free',
      },
      me: { userId: req.session.userId, role: membership.role },
    });
  } catch (error) {
    console.error('List org members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/**
 * PATCH /api/orgs/:orgId/members/:userId — change role (admin/owner).
 */
router.patch('/:orgId/members/:userId', async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const actor = await requireOrgMembership(req, res, orgId, 'admin');
    if (!actor) return;

    const nextRole = String(req.body?.role || '').trim();
    if (!isOrgRole(nextRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Only an owner can grant/revoke owner.
    if (nextRole === 'owner' && actor.role !== 'owner') {
      return res.status(403).json({ error: 'Only an owner can transfer ownership' });
    }
    if (actor.role !== 'owner' && !ASSIGNABLE_ORG_ROLES.includes(nextRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for that role' });
    }

    const target = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!target) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Admins cannot change owners or other admins (only owners can manage owners/admins at peer+).
    if (actor.role === 'admin' && roleAtLeast(target.role, 'admin')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (target.role === 'owner' && nextRole !== 'owner') {
      const owners = await countOwners(orgId);
      if (owners <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last owner' });
      }
    }

    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: { role: nextRole },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    res.json({
      member: {
        id: updated.id,
        userId: updated.userId,
        role: updated.role,
        createdAt: updated.createdAt,
        email: updated.user.email,
        displayName: updated.user.displayName,
      },
    });
  } catch (error) {
    console.error('Patch org member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

/**
 * DELETE /api/orgs/:orgId/members/:userId — remove member (admin/owner).
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
      actor = await requireOrgMembership(req, res, orgId, 'admin');
    }
    if (!actor) return;

    const target = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!target) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (!isSelf) {
      if (actor.role === 'admin' && roleAtLeast(target.role, 'admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    if (target.role === 'owner') {
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
      },
    });

    res.json({
      invites: invites.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        invitedBy: {
          id: inv.invitedBy.id,
          email: inv.invitedBy.email,
          displayName: inv.invitedBy.displayName,
        },
      })),
      canManage: canManageMembers(membership.role),
    });
  } catch (error) {
    console.error('List org invites error:', error);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

/**
 * POST /api/orgs/:orgId/invites — { email, role } (admin/owner).
 */
router.post('/:orgId/invites', async (req, res) => {
  try {
    const { orgId } = req.params;
    const actor = await requireOrgMembership(req, res, orgId, 'admin');
    if (!actor) return;

    const email = normalizeEmail(req.body?.email);
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    let role = String(req.body?.role || 'member').trim();
    if (role === 'owner') {
      return res.status(400).json({ error: 'Cannot invite as owner; transfer ownership after join' });
    }
    if (!ASSIGNABLE_ORG_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    // Admins can only invite member/viewer
    if (actor.role === 'admin' && role === 'admin') {
      return res.status(403).json({ error: 'Only an owner can invite admins' });
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
        role,
        tokenHash,
        invitedById: req.session.userId,
        expiresAt,
      },
    });

    const inviteUrl = `${appBaseUrl()}/invites/${rawToken}`;
    let emailSent = false;
    let emailSkipped = !isResendConfigured();

    const inviter = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { email: true, displayName: true },
    });

    try {
      const result = await sendOrgInviteEmail({
        to: email,
        inviteUrl,
        organizationName: org.name,
        inviterName: inviter?.displayName || inviter?.email || 'A teammate',
        role,
        expiresDays: Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000)),
      });
      emailSent = !result?.skipped;
      emailSkipped = Boolean(result?.skipped);
    } catch (emailError) {
      console.error('Failed to send org invite email:', emailError);
      if (process.env.NODE_ENV === 'production' && isResendConfigured()) {
        // Keep invite but surface that email failed — still return URL for manual share.
        emailSent = false;
      }
    }

    if (process.env.NODE_ENV !== 'production' || emailSkipped) {
      console.log('\n=== ORG INVITE ===');
      console.log(`Org: ${org.name} (${orgId})`);
      console.log(`Email: ${email}`);
      console.log(`Role: ${role}`);
      console.log(`Invite URL: ${inviteUrl}`);
      console.log(`Expires: ${expiresAt.toISOString()}`);
      console.log('==================\n');
    }

    const payload = {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
      emailSent,
      emailSkipped,
    };

    // Dev / unconfigured email: return invite URL (same pattern as magic-link console).
    if (emailSkipped || process.env.NODE_ENV !== 'production') {
      payload.inviteUrl = inviteUrl;
    } else if (!emailSent) {
      // Production with Resend configured but send failed — still return URL so admin can share.
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
    const actor = await requireOrgMembership(req, res, orgId, 'admin');
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

export default router;
