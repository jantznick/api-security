import { PrismaClient } from '@prisma/client';

function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      // Keep the pool small — soft-launch / idle RSS is dominated by Prisma's
      // query engine; extra connections mostly inflate Postgres + app memory.
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '2');
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
