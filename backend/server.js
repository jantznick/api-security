import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import inventoryRoutes from './routes/inventory.js';

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(cookieParser());

const PgSession = connectPgSimple(session);
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS || 10_000),
});

const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: 'session',
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    name: 'connect.sid',
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: isProduction ? 'none' : 'lax',
      domain: cookieDomain,
      path: '/',
    },
    proxy: isProduction,
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/inventory', inventoryRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'core', date: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Core API running on port ${PORT}`);
});
