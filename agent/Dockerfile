FROM node:20-alpine

WORKDIR /app

# Shared package first so file: dependency resolves
COPY packages/shared /app/packages/shared
COPY agent/package.json /app/agent/package.json

WORKDIR /app/agent
RUN npm install --omit=dev

COPY agent/src /app/agent/src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
