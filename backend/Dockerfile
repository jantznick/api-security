FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
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
