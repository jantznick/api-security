/**
 * Production migrate-on-boot for Railway (core + ingest).
 * Prisma migrate deploy is idempotent and uses an advisory lock, so both
 * services may run this safely when they deploy in parallel after merge to main.
 *
 * Env:
 *   PRISMA_SCHEMA — optional path to schema.prisma (ingest sets this in Docker)
 *   SKIP_MIGRATE=1 — skip (local/debug only; never set in production)
 */
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSchema() {
  if (process.env.PRISMA_SCHEMA?.trim()) {
    return process.env.PRISMA_SCHEMA.trim();
  }
  // backend/scripts → backend/prisma/schema.prisma
  const besideBackend = path.resolve(__dirname, '../prisma/schema.prisma');
  if (existsSync(besideBackend)) return besideBackend;
  // ingest cwd fallback when script is invoked as ../backend/scripts/...
  const fromIngestCwd = path.resolve(process.cwd(), '../backend/prisma/schema.prisma');
  if (existsSync(fromIngestCwd)) return fromIngestCwd;
  return null;
}

function safeMigrate() {
  if (process.env.SKIP_MIGRATE === '1' || process.env.SKIP_MIGRATE === 'true') {
    console.log('SKIP_MIGRATE set — skipping prisma migrate deploy');
    return true;
  }

  const schema = resolveSchema();
  const cmd = schema
    ? `npx prisma migrate deploy --schema=${JSON.stringify(schema)}`
    : 'npx prisma migrate deploy';

  console.log(
    schema
      ? `Running database migrations (schema=${schema})...`
      : 'Running database migrations...',
  );

  try {
    execSync(cmd, { stdio: 'inherit', env: process.env });
    console.log('Migrations completed successfully');
    return true;
  } catch (error) {
    console.error('Migration failed:', error.message);
    return false;
  }
}

const success = safeMigrate();
process.exit(success ? 0 : 1);
