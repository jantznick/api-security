import prisma from '../lib/prisma.js';
import { isAdminEmail } from '../lib/admin.js';

/**
 * Requires an authenticated session whose user email matches ADMIN_EMAIL.
 * Must run after requireAuth (or checks session itself).
 */
export async function requireAdmin(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user || !isAdminEmail(user.email)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error('requireAdmin error:', error);
    res.status(500).json({ error: 'Admin check failed' });
  }
}
