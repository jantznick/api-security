FROM node:20-alpine

WORKDIR /app

# Prisma schema + migrations live in backend/; ingest generates client from them
# and runs the same migrate-on-boot path as core (idempotent / advisory-locked).
COPY backend/prisma /app/backend/prisma
COPY backend/scripts/safe-migrate.js /app/backend/scripts/safe-migrate.js
COPY ingest/package.json ingest/package-lock.json* /app/ingest/

WORKDIR /app/ingest
# prisma is a devDependency; install all deps so generate + migrate work at runtime.
RUN npm install \
  && npx prisma generate --schema=../backend/prisma/schema.prisma

COPY ingest/ /app/ingest/

ENV NODE_ENV=production
ENV PORT=3002
ENV PRISMA_SCHEMA=/app/backend/prisma/schema.prisma
EXPOSE 3002

# Migrate then serve — Railway auto-deploys on merge to main; no manual migrate.
CMD ["npm", "start"]
