import { PrismaClient } from '@prisma/client';

function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '5');
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
