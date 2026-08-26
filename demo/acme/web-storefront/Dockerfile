FROM node:22-alpine

WORKDIR /workspace/demo/acme/web-storefront

COPY demo/acme/web-storefront/package.json ./
COPY packages/middleware /workspace/packages/middleware
COPY packages/shared /workspace/packages/shared
RUN npm install --omit=dev

COPY demo/acme/web-storefront/server.js ./

ENV PORT=4010
EXPOSE 4010

CMD ["node", "server.js"]
