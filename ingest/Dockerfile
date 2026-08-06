FROM node:20-alpine

WORKDIR /app

# Prisma schema lives in backend/; ingest generates client from it.
COPY backend/prisma /app/backend/prisma
COPY ingest/package.json ingest/package-lock.json* /app/ingest/

WORKDIR /app/ingest
# prisma is a devDependency; install all deps so generate works at build time.
RUN npm install \
  && npx prisma generate --schema=../backend/prisma/schema.prisma

COPY ingest/ /app/ingest/

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# Generate already ran at build; do not re-run postinstall/start generate.
CMD ["node", "server.js"]
