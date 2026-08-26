/**
 * Shared session + find-or-create user helpers for magic login and invite redeem.
 */

import prisma from './prisma.js';
import { withAdminFlag } from './admin.js';
import { ensurePersonalOrg } from './orgs.js';

export const userSelect = {
  id: true,
  email: true,
  displayName: true,
  planSlug: true,
  createdAt: true,
};

export function publicUser(user) {
  return withAdminFlag({
    ...user,
    orgs: Array.isArray(user?.orgs) ? user.orgs : [],
  });
}

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export async function regenerateSession(req) {
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Persist session after setting userId/email. Does not write the HTTP response.
 */
export async function saveSessionAsync(req) {
  await new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Regenerate the session cookie and attach the user (same as magic-link login).
 */
export async function establishUserSession(req, user) {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.email = user.email;
  await saveSessionAsync(req);
}

/**
 * Find user by email or create one, then ensure personal org exists.
 */
export async function findOrCreateUser(email) {
  const normalizedEmail = normalizeEmail(email);

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { email: normalizedEmail },
    });
  }

  await ensurePersonalOrg(user);
  return user;
}

/**
 * Magic-login completion: find/create user, establish session, respond with { user }.
 */
export async function completeMagicLogin(req, res, email) {
  const created = await findOrCreateUser(email);
  const user = await prisma.user.findUnique({
    where: { id: created.id },
    select: userSelect,
  });
  try {
    await establishUserSession(req, user);
  } catch (err) {
    console.error('Session save error:', err);
    res.status(500).json({ error: 'Failed to save session' });
    return;
  }
  res.json({ user: publicUser(user) });
}
