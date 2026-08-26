FROM node:22-alpine

WORKDIR /workspace/demo/acme/ledger-api

COPY demo/acme/ledger-api/package.json ./
COPY packages/middleware /workspace/packages/middleware
COPY packages/shared /workspace/packages/shared
RUN npm install --omit=dev

COPY demo/acme/ledger-api/server.js ./

ENV PORT=4014
EXPOSE 4014

CMD ["node", "server.js"]
