/**
 * Public invite accept flow (S4).
 *
 * GET  /api/invites/:token — preview (auth optional; email must match when authed)
 * POST /api/invites/:token/accept — create Membership; mark accepted
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { hashApiKey } from '../lib/apiKeys.js';
import { requireAuth } from '../middleware/auth.js';
import { getOrgSeatStatus, wouldExceedSeatLimit } from '../lib/seats.js';

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
    },
  });
}

function invitePublicView(invite) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
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
      authenticatedEmail: null,
    });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({ error: 'Failed to load invite' });
  }
});

/**
 * POST /api/invites/:token/accept
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
    if (status === 'accepted') {
      return res.status(410).json({ error: 'This invite was already accepted' });
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

    if (String(user.email).toLowerCase() !== String(invite.email).toLowerCase()) {
      return res.status(403).json({
        error: `Sign in as ${invite.email} to accept this invite`,
        expectedEmail: invite.email,
      });
    }

    const existing = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: user.id,
        },
      },
    });
    if (existing) {
      await prisma.orgInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return res.json({
        membership: {
          id: existing.id,
          organizationId: existing.organizationId,
          userId: existing.userId,
          role: existing.role,
        },
        organization: invite.organization,
        alreadyMember: true,
      });
    }

    // Seat check on accept: count current members only (this invite already reserved a pending seat).
    const seats = await getOrgSeatStatus(invite.organizationId);
    // Exclude this invite from pending when checking member room.
    const membersOnly = seats?.memberCount ?? 0;
    if (wouldExceedSeatLimit(membersOnly, seats?.limit, 1)) {
      return res.status(403).json({
        error: `Seat limit reached (${seats.limit}). Ask an admin to free a seat or upgrade.`,
        seats: {
          used: membersOnly,
          limit: seats.limit,
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
        },
      });
      await tx.orgInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return membership;
    });

    res.status(201).json({
      membership: {
        id: result.id,
        organizationId: result.organizationId,
        userId: result.userId,
        role: result.role,
      },
      organization: invite.organization,
      alreadyMember: false,
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
