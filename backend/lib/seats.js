/**
 * Seat enforcement (D11 / S4).
 * Free = 3 members including owner. Prefer Organization.seatLimit snapshot.
 */

import prisma from './prisma.js';
import { resolveOrgSeatLimit } from './plans.js';

/**
 * Count seats used toward the org cap: active members + pending invites.
 * Pending = not accepted, not revoked, not expired.
 */
export async function countOrgSeatsUsed(organizationId) {
  const now = new Date();
  const [memberCount, pendingInvites] = await Promise.all([
    prisma.membership.count({ where: { organizationId } }),
    prisma.orgInvite.count({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);
  return { memberCount, pendingInvites, used: memberCount + pendingInvites };
}

/**
 * Resolve seat limit for an org (prefer snapshotted org.seatLimit).
 * @returns {Promise<{ limit: number|null, planSlug: string, used: number, memberCount: number, pendingInvites: number }>}
 */
export async function getOrgSeatStatus(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      planSlug: true,
      seatLimit: true,
      planAssignedAt: true,
    },
  });
  if (!org) {
    return null;
  }

  const planSlug = org.planSlug || 'free';
  const limit = await resolveOrgSeatLimit(org);
  const counts = await countOrgSeatsUsed(organizationId);

  return {
    organizationId,
    planSlug,
    limit,
    ...counts,
  };
}

/**
 * Whether adding `delta` more seats (invite or accept) would exceed the cap.
 * null limit = unlimited.
 */
export function wouldExceedSeatLimit(used, limit, delta = 1) {
  if (limit === null || limit === undefined) return false;
  return used + delta > limit;
}
