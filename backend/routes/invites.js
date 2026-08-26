/**
 * Public invite accept / redeem flow (S4).
 *
 * GET  /api/invites/:token — preview (auth optional)
 * POST /api/invites/:token/redeem — magic-link style: find/create user, join org, set session
 * POST /api/invites/:token/accept — create Membership when already authed as invite email
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { hashApiKey } from '../lib/apiKeys.js';
import { requireAuth } from '../middleware/auth.js';
import { getOrgSeatStatus, wouldExceedSeatLimit } from '../lib/seats.js';
import {
  establishUserSession,
  findOrCreateUser,
  normalizeEmail,
  publicUser,
  userSelect,
} from '../lib/sessionAuth.js';

const router = express.Router();

function normalizeToken(token) {
  if (Array.isArray(token)) return token.join('');
  return String(token || '').trim();
}

async function findInviteByRawToken(rawToken) {
  const tokenHash = hashApiKey(rawToken);
  return prisma.orgInvite.findUnique({
    where: { tokenHash },
    include: {
      organization: {
        select: { id: true, name: true, slug: true, isPersonal: true, planSlug: true },
      },
      invitedBy: { select: { id: true, email: true, displayName: true } },
      customRole: { select: { id: true, key: true, name: true } },
    },
  });
}

function invitePublicView(invite) {
  const roleName = invite.customRole?.name || invite.role;
  return {
    id: invite.id,
    email: invite.email,
    role: invite.customRoleId ? null : invite.role,
    customRoleId: invite.customRoleId || null,
    roleKey: invite.customRoleId ? invite.customRole?.key || null : invite.role,
    roleName,
    roleRef: invite.customRoleId ? `custom:${invite.customRoleId}` : invite.role,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    revokedAt: invite.revokedAt,
    organization: invite.organization,
    invitedBy: invite.invitedBy
      ? {
          displayName: invite.invitedBy.displayName,
          email: invite.invitedBy.email,
        }
      : null,
  };
}

function inviteStatus(invite) {
  if (!invite) return 'not_found';
  if (invite.revokedAt) return 'revoked';
  if (invite.acceptedAt) return 'accepted';
  if (invite.expiresAt < new Date()) return 'expired';
  return 'pending';
}

function membershipPayload(membership) {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.customRoleId ? null : membership.role,
    customRoleId: membership.customRoleId || null,
    roleRef: membership.customRoleId ? `custom:${membership.customRoleId}` : membership.role,
  };
}

async function sessionUserEmail(req) {
  if (!req.session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true, email: true },
  });
  return user || null;
}

async function assertCustomRoleStillValid(invite) {
  if (!invite.customRoleId) return { ok: true };
  const customRole = await prisma.orgRoleDefinition.findFirst({
    where: {
      id: invite.customRoleId,
      organizationId: invite.organizationId,
      isSystem: false,
    },
  });
  if (!customRole) {
    return {
      ok: false,
      status: 410,
      error: 'The role on this invite no longer exists. Ask an admin to send a new invite.',
    };
  }
  return { ok: true };
}

/**
 * Ensure membership exists for invite.email's user; mark invite accepted.
 * Caller must have already validated invite is redeemable (or already accepted for idempotent path).
 */
async function ensureMembershipForInvite(invite, user) {
  const existing = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: user.id,
      },
    },
  });

  if (existing) {
    if (!invite.acceptedAt) {
      await prisma.orgInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    }
    return { membership: existing, alreadyMember: true, created: false };
  }

  const seats = await getOrgSeatStatus(invite.organizationId);
  const membersOnly = seats?.memberCount ?? 0;
  if (wouldExceedSeatLimit(membersOnly, seats?.limit, 1)) {
    const err = new Error(
      `Seat limit reached (${seats.limit}). Ask an admin to free a seat or upgrade.`,
    );
    err.status = 403;
    err.payload = {
      error: err.message,
      seats: { used: membersOnly, limit: seats.limit },
    };
    throw err;
  }

  const roleCheck = await assertCustomRoleStillValid(invite);
  if (!roleCheck.ok) {
    const err = new Error(roleCheck.error);
    err.status = roleCheck.status;
    err.payload = { error: roleCheck.error };
    throw err;
  }

  const membership = await prisma.$transaction(async (tx) => {
    const created = await tx.membership.create({
      data: {
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.role,
        customRoleId: invite.customRoleId || null,
      },
    });
    await tx.orgInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    return created;
  });

  return { membership, alreadyMember: false, created: true };
}

/**
 * GET /api/invites/:token
 */
router.get('/:token', async (req, res) => {
  try {
    const raw = normalizeToken(req.params.token);
    if (!raw) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const invite = await findInviteByRawToken(raw);
    const status = inviteStatus(invite);
    if (status === 'not_found') {
      return res.status(404).json({ error: 'Invite not found', status });
    }

    const sessionUser = await sessionUserEmail(req);
    const seats = await getOrgSeatStatus(invite.organizationId);
    res.json({
      status,
      invite: invitePublicView(invite),
      seats: seats
        ? {
            used: seats.memberCount,
            pendingInvites: seats.pendingInvites,
            reserved: seats.used,
            limit: seats.limit,
          }
        : null,
      authenticatedEmail: sessionUser?.email || null,
    });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({ error: 'Failed to load invite' });
  }
});

/**
 * POST /api/invites/:token/redeem
 *
 * Magic-link style: validate invite → findOrCreateUser(invite.email) → ensurePersonalOrg
 * (inside findOrCreateUser) → Membership → mark accepted → establish session.
 *
 * If already logged in as a different email: 403 (do not attach wrong user).
 * If already a member / already accepted: idempotent success + session for invite email.
 */
router.post('/:token/redeem', async (req, res) => {
  try {
    const raw = normalizeToken(req.params.token);
    if (!raw) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const invite = await findInviteByRawToken(raw);
    const status = inviteStatus(invite);
    if (status === 'not_found') {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (status === 'revoked') {
      return res.status(410).json({ error: 'This invite was revoked' });
    }
    if (status === 'expired') {
      return res.status(410).json({ error: 'This invite has expired' });
    }

    const sessionUser = await sessionUserEmail(req);
    const inviteEmail = normalizeEmail(invite.email);

    if (sessionUser && normalizeEmail(sessionUser.email) !== inviteEmail) {
      return res.status(403).json({
        error: `You're signed in as ${sessionUser.email}. Sign out, or open this invite in a private window, to join as ${invite.email}.`,
        code: 'EMAIL_MISMATCH',
        sessionEmail: sessionUser.email,
        expectedEmail: invite.email,
      });
    }

    // Pending or already-accepted (idempotent): find/create the invitee and ensure membership.
    const created = await findOrCreateUser(invite.email);
    let result;
    try {
      result = await ensureMembershipForInvite(invite, created);
    } catch (joinError) {
      if (joinError?.status && joinError?.payload) {
        return res.status(joinError.status).json(joinError.payload);
      }
      throw joinError;
    }

    const user = await prisma.user.findUnique({
      where: { id: created.id },
      select: userSelect,
    });

    // Establish session for invite email (same as completeMagicLogin), unless already that session.
    const alreadyMatchingSession =
      sessionUser && normalizeEmail(sessionUser.email) === inviteEmail;
    if (!alreadyMatchingSession) {
      try {
        await establishUserSession(req, user);
      } catch (err) {
        console.error('Invite redeem session error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }
    }

    const statusCode = result.created ? 201 : 200;
    res.status(statusCode).json({
      user: publicUser(user),
      membership: membershipPayload(result.membership),
      organization: invite.organization,
      alreadyMember: result.alreadyMember,
    });
  } catch (error) {
    console.error('Redeem invite error:', error);
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Already a member of this organization' });
    }
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

/**
 * POST /api/invites/:token/accept
 * Legacy path for already-authenticated invitees (same email). Prefer /redeem.
 */
router.post('/:token/accept', requireAuth, async (req, res) => {
  try {
    const raw = normalizeToken(req.params.token);
    if (!raw) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const invite = await findInviteByRawToken(raw);
    const status = inviteStatus(invite);
    if (status === 'not_found') {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (status === 'revoked') {
      return res.status(410).json({ error: 'This invite was revoked' });
    }
    if (status === 'expired') {
      return res.status(410).json({ error: 'This invite has expired' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
      return res.status(403).json({
        error: `Sign in as ${invite.email} to accept this invite`,
        expectedEmail: invite.email,
        code: 'EMAIL_MISMATCH',
      });
    }

    // Idempotent: already accepted still succeeds if membership exists / is created.
    let result;
    try {
      result = await ensureMembershipForInvite(invite, user);
    } catch (joinError) {
      if (joinError?.status && joinError?.payload) {
        return res.status(joinError.status).json(joinError.payload);
      }
      throw joinError;
    }

    const statusCode = result.created ? 201 : 200;
    res.status(statusCode).json({
      membership: membershipPayload(result.membership),
      organization: invite.organization,
      alreadyMember: result.alreadyMember,
    });
  } catch (error) {
    console.error('Accept invite error:', error);
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Already a member of this organization' });
    }
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;
