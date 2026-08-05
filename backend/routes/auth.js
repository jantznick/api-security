import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { withAdminFlag } from '../lib/admin.js';
import { isResendConfigured, sendMagicLinkEmail } from '../services/email/resend.js';

const router = express.Router();

const TOKEN_TTL_MS = 15 * 60 * 1000;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSelect = {
  id: true,
  email: true,
  createdAt: true,
};

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeToken(token) {
  if (Array.isArray(token)) {
    return token.join('');
  }
  return String(token).trim();
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateLinkToken() {
  return crypto.randomUUID();
}

async function cleanupExpiredTokens() {
  try {
    await prisma.magicToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (error) {
    console.error('Error cleaning up expired magic tokens:', error);
  }
}

setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

function saveSession(req, res, user) {
  req.session.userId = user.id;
  req.session.email = user.email;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      res.status(500).json({ error: 'Failed to save session' });
      return;
    }

    res.json({ user: withAdminFlag(user) });
  });
}

async function regenerateSession(req) {
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function findOrCreateUser(email) {
  const normalizedEmail = normalizeEmail(email);

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { email: normalizedEmail },
    });
  }

  return user;
}

async function completeMagicLogin(req, res, email) {
  const user = await findOrCreateUser(email);
  await regenerateSession(req);
  saveSession(req, res, {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  });
}

async function issueMagicTokens(email) {
  const normalizedEmail = normalizeEmail(email);
  const sixDigitCode = generateSixDigitCode();
  const linkToken = generateLinkToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.magicToken.deleteMany({
    where: { email: normalizedEmail },
  });

  await prisma.magicToken.createMany({
    data: [
      { token: sixDigitCode, email: normalizedEmail, expiresAt },
      { token: linkToken, email: normalizedEmail, expiresAt },
    ],
  });

  return { sixDigitCode, linkToken, expiresAt };
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = normalizeEmail(email);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
      },
      select: userSelect,
    });

    await regenerateSession(req);
    saveSession(req, res, user);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await regenerateSession(req);
    saveSession(req, res, {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/magic-token/request', async (req, res) => {
  try {
    const { email, intent = 'login' } = req.body;

    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (!isResendConfigured() && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Email sign-in is not configured' });
    }

    const normalizedEmail = normalizeEmail(email);
    const { sixDigitCode, linkToken, expiresAt } = await issueMagicTokens(normalizedEmail);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const loginPath = intent === 'register' ? '/register' : '/login';
    const loginUrl = `${frontendUrl}${loginPath}?token=${linkToken}`;

    try {
      await sendMagicLinkEmail({
        to: normalizedEmail,
        loginUrl,
        code: sixDigitCode,
        expiresMinutes: Math.round(TOKEN_TTL_MS / 60000),
      });
    } catch (emailError) {
      console.error('Failed to send magic link email:', emailError);
      if (process.env.NODE_ENV === 'production') {
        throw emailError;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('\n=== MAGIC TOKEN ===');
      console.log(`Email: ${normalizedEmail}`);
      console.log(`6-Digit Code: ${sixDigitCode}`);
      console.log(`Login Link: ${loginUrl}`);
      console.log(`Link Token: ${linkToken}`);
      console.log(`Expires at: ${expiresAt.toISOString()}`);
      console.log('===================\n');
    }

    res.json({
      message: 'If that email is valid, we sent a sign-in link and code.',
    });
  } catch (error) {
    console.error('Magic token request error:', error);
    res.status(500).json({ error: 'Failed to send sign-in email' });
  }
});

router.post('/magic-token/login', async (req, res) => {
  try {
    const token = normalizeToken(req.body.token);

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const magicToken = await prisma.magicToken.findUnique({
      where: { token },
    });

    if (!magicToken) {
      return res.status(401).json({ error: 'Invalid or expired sign-in link' });
    }

    if (magicToken.expiresAt < new Date()) {
      await prisma.magicToken.delete({ where: { id: magicToken.id } });
      return res.status(401).json({ error: 'Sign-in link has expired' });
    }

    await prisma.magicToken.delete({ where: { id: magicToken.id } });

    await completeMagicLogin(req, res, magicToken.email);
  } catch (error) {
    console.error('Magic token login error:', error);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: userSelect,
    });

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({ user: withAdminFlag(user) });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
