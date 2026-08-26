# Demo NestJS app (API Glimpse)

Small Nest app using `@apiglimpse/nestjs` (Express adapter by default).

## Setup

```bash
# From repo root — build the Nest connector first
cd packages/nestjs && npm install && npm run build

cd ../../demo/nestjs-app
cp .env.example .env
npm install
```

Point `API_SENSOR_*` at a running agent (local `agent/` on `:8080`, or hosted collector).

## Run

```bash
npm start
# or: npm run dev
```

App listens on `PORT` (default **4002**).

## Try it

```bash
curl -s http://localhost:4002/health
curl -s http://localhost:4002/api/users
curl -s http://localhost:4002/api/users/1
curl -s -X POST http://localhost:4002/api/users \
  -H 'content-type: application/json' \
  -d '{"email":"carol@example.com","name":"Carol","password":"secret"}'
curl -s -X POST http://localhost:4002/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"demo"}'
curl -s http://localhost:4002/api/orders/99/items/3
```

Samples are flushed to `API_SENSOR_AGENT_URL` (see `.env.example`).
