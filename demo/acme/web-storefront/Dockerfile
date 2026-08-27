FROM node:22-alpine

# Install file: deps bottom-up so middleware can resolve @apiglimpse/shared at runtime.
COPY packages/shared /workspace/packages/shared
COPY packages/middleware /workspace/packages/middleware
WORKDIR /workspace/packages/middleware
RUN npm install --omit=dev

WORKDIR /workspace/demo/acme/web-storefront
COPY demo/acme/web-storefront/package.json ./
RUN npm install --omit=dev

COPY demo/acme/web-storefront/server.js ./

ENV PORT=4010
EXPOSE 4010

CMD ["node", "server.js"]
