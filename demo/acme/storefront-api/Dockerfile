FROM node:22-alpine

WORKDIR /workspace/demo/acme/storefront-api

COPY demo/acme/storefront-api/package.json ./
COPY packages/middleware /workspace/packages/middleware
COPY packages/shared /workspace/packages/shared
RUN npm install --omit=dev

COPY demo/acme/storefront-api/server.js ./

ENV PORT=4011
EXPOSE 4011

CMD ["node", "server.js"]
