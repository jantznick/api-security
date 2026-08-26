FROM node:20-alpine

# Shared package for file: dependency (SF9 topology compare)
COPY packages/shared /app/packages/shared

COPY backend/package.json backend/package-lock.json* /app/backend/

WORKDIR /app/backend
# Install before NODE_ENV=production so prisma (devDependency) is available
# for generate + migrate-on-boot (`npm start` → safe-migrate.js).
# Railway auto-deploys on merge to main; migrations apply at container start.
RUN npm install

COPY backend/ ./
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
