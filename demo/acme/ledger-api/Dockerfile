FROM node:22-alpine

# Install file: deps bottom-up so middleware can resolve @apiglimpse/shared at runtime.
COPY packages/shared /workspace/packages/shared
COPY packages/middleware /workspace/packages/middleware
WORKDIR /workspace/packages/middleware
RUN npm install --omit=dev

WORKDIR /workspace/demo/acme/ledger-api
COPY demo/acme/ledger-api/package.json ./
RUN npm install --omit=dev

COPY demo/acme/ledger-api/server.js ./

ENV PORT=4014
EXPOSE 4014

CMD ["node", "server.js"]
