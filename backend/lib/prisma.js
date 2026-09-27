import { PrismaClient } from '@prisma/client';

function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;

  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      // Default 2 is enough for idle / light dashboard traffic; raise via env under load.
      const limit = process.env.PRISMA_CONNECTION_LIMIT || '2';
      url.searchParams.set('connection_limit', limit);
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', process.env.PRISMA_POOL_TIMEOUT || '10');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl() },
  },
});

export default prisma;
