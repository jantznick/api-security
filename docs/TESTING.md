# Manual testing guide

The implementation agent **did not** run Docker, `npm install`, migrations, or servers. Follow this guide on your machine.

## Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Ports free: `5432`, `3001`, `3002`, `4000`, `5173`, `5174`, `5175`, `8080`

## 1. Start infrastructure

From the repo root:

```bash
docker-compose up -d
```

Confirm:

```bash
docker-compose ps
# postgres healthy, agent running

curl -s http://localhost:8080/health
# {"status":"ok"}
```

> Agent accepts samples only with a valid project API key (step 5). Without it, batches get `401`.

## 2. Install dependencies

```bash
# Core
cd backend && cp .env.example .env && npm install && npx prisma generate && npx prisma migrate deploy
cd ..

# Ingest (shares backend Prisma schema)
cd ingest && cp .env.example .env && npm install && npx prisma generate --schema=../backend/prisma/schema.prisma
cd ..

# Frontend (dashboard)
cd frontend && cp .env.example .env && npm install
cd ..

# Optional — marketing (production-style auth on :5174)
cd marketing && cp .env.example .env && npm install
cd ..

# Shared + middleware (file: deps for demo)
cd packages/shared && npm install
cd ../middleware && npm install
cd ../..

# Demo app
cd demo/express-app && cp .env.example .env && npm install
cd ../..

# Optional: run agent locally instead of Docker
# cd agent && cp .env.example .env && npm install
```

## 3. Start app processes

Use **four terminals** (plus Docker for agent/postgres). Marketing is optional for app-only auth.

```bash
# Terminal A — Core API
cd backend && npm run dev
# → http://localhost:3001/api/health

# Terminal B — Ingest API
cd ingest && npm run dev
# → http://localhost:3002/health

# Terminal C — Dashboard
cd frontend && npm run dev
# → http://localhost:5173  (welcome + AuthModal)

# Terminal D — Demo (after API key in step 5)
cd demo/express-app && npm run dev
# → http://localhost:4000/health

# Optional — Marketing (same AuthModal; cross-origin handoff)
# cd marketing && npm run dev
# → http://localhost:5174
# For shared session cookie across :5174 → :5173, set VITE_API_URL=http://localhost:3001
# on BOTH frontend/.env and marketing/.env (see docs/DEPLOY.md#local-dev).
```

Health checks:

```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:3002/health
curl -s http://localhost:4000/health   # after demo is up
```

## 4. Auth (vacation-home parity)

1. Open http://localhost:5173 → **welcome** page; click **Sign in** or **Create account** (AuthModal)
2. Register with email + password (min 6 chars)
3. Confirm you land on **Projects**
4. Sign out → welcome again → sign in with password
5. Magic link (dev):
   - In the modal, enter email → **Email me a magic link instead**
   - Check **backend** terminal for `=== MAGIC TOKEN ===` (6-digit code + link)
   - Enter the 6-digit code, or open the printed login link (`/login?token=` opens the modal)
6. Optional: `GET /api/auth/me` via browser session should return the user after login
7. Optional: run marketing on `:5174` with `VITE_API_URL=http://localhost:3001` on both apps

## 5. Create project + wire API key

1. In the dashboard, create a project (e.g. `Demo project`)
2. **Copy the API key shown once** (`ask_…`)
3. Put it only on the **demo app** (and any real apps). The hosted agent validates each request’s key via ingest — no agent `INGEST_API_KEY` env needed.

**Demo app** (`demo/express-app/.env`):

```
API_SENSOR_AGENT_URL=http://localhost:8080
API_SENSOR_KEY=ask_YOUR_KEY_HERE
PORT=4000
```

Restart the demo process after editing `.env`.

Optional — confirm introspect works:

```bash
curl -s -H "X-API-Key: ask_YOUR_KEY_HERE" http://localhost:3002/v1/auth/introspect
# → {"ok":true,"projectId":"...","projectName":"..."}

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/v1/samples \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"samples":[]}'
# → 401 (no key)

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/v1/samples \
  -H 'Content-Type: application/json' -H "X-API-Key: ask_YOUR_KEY_HERE" \
  -d '{"version":1,"apiKey":"ask_YOUR_KEY_HERE","samples":[]}'
# → 202
```

## 6. Generate traffic

```bash
curl -s http://localhost:4000/api/users | jq .
curl -s http://localhost:4000/api/users/1 | jq .
curl -s http://localhost:4000/api/users/2 | jq .
curl -s -X POST http://localhost:4000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"carol@example.com","name":"Carol","phone":"555-0199","password":"secret","ssn":"123-45-6789"}' | jq .
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"hunter2"}' | jq .
curl -s http://localhost:4000/api/orders/abc123/items/99 | jq .
curl -s -H 'Authorization: Bearer demo-token' http://localhost:4000/api/users | jq .
```

Wait ~3–5 seconds for agent flush → ingest.

## 7. Verify dashboard inventory

1. Open the project → inventory table
2. Expect path templates such as:
   - `GET /api/users`
   - `GET /api/users/{id}` (not separate rows per user id)
   - `POST /api/users`
   - `POST /api/auth/login`
   - `GET /api/orders/{id}/items/{id}` or similar templating
3. Open an endpoint detail:
   - Request/response **schema tree** populated for JSON routes
   - **Signals** for email / phone / password / ssn / jwt / auth_observed as applicable
4. Confirm hit counts increase after repeating curls

## 8. Verify Postgres has no raw bodies

```bash
docker exec -it api-security-db psql -U postgres -d api_security -c \
  '\dt'

docker exec -it api-security-db psql -U postgres -d api_security -c \
  'SELECT method, "pathTemplate", "hitCount", "authModes" FROM "Endpoint";'

docker exec -it api-security-db psql -U postgres -d api_security -c \
  'SELECT type, "fieldPath", category, severity FROM "Signal" LIMIT 20;'
```

There is **no** table for raw request/response bodies. `requestSchema` / `responseSchema` are JSON Schema-ish fragments only.

### Response capture limitations (connectors)

Connectors sample response **shapes**, not full payloads:

- JSON via framework helpers (`res.json`, Fastify objects, FastAPI JSON, Go `Write` of JSON) → `response.bodyShape` + `responseBodyCaptured: true`
- Empty bodies, binary (`octet-stream` / images), SSE/streaming, and bodies over the ~64 KiB client cap → not shaped (`responseBodyCaptured: false`)
- Fail-open: if the collector is down, the app response path is unchanged

## 9. Fail-open check

1. Stop the agent: `docker-compose stop agent`
2. Hit demo routes again — **demo must keep returning 200/201**
3. Middleware should not throw; agent flush fails quietly (circuit opens)
4. Start agent again: `docker-compose start agent`
5. New traffic should resume upserts (with valid API key)

## 10. Optional local agent (without Docker agent)

```bash
docker-compose stop agent
cd agent && cp .env.example .env
# Set INGEST_URL=http://localhost:3002 (keys come per-request from middleware)
npm install && npm run dev
```

Point demo `API_SENSOR_AGENT_URL=http://localhost:8080` and `API_SENSOR_KEY=ask_...`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Inventory empty | Valid `API_SENSOR_KEY` on demo; ingest `:3002` up; agent introspect + upsert logs |
| Agent 401 on samples | Key missing/wrong; create project key in dashboard |
| Agent 503 on samples | Ingest down or unreachable from agent (`INGEST_URL`) |
| `Invalid API key` on ingest | Key must be the raw `ask_…` from project create, not the prefix |
| Prisma client missing on ingest | From `ingest/`: `npm run prisma:generate` (writes into ingest `node_modules`; `npm run dev` also runs this first) |
| Session / CORS issues | `FRONTEND_URL=http://localhost:5173`, Vite proxy, `credentials: 'include'` |
| Agent can't reach ingest from Docker | `INGEST_URL=http://host.docker.internal:3002` + `extra_hosts` in compose |
| Magic link email | Dev logs tokens to backend console when Resend unset |

## Done criteria checklist

- [ ] Register / login / magic link works
- [ ] Demo → middleware → agent → ingest → Postgres inventory
- [ ] Dashboard shows endpoints, schemas, signals
- [ ] Path IDs collapsed to templates
- [ ] No raw bodies in DB
- [ ] Kill agent → demo still works (fail-open)

## Acme sales demo stack (optional)

Five-service chain under `demo/acme/` for topology compare + sales calls. See [ACME_DEMO_SMOKE.md](./ACME_DEMO_SMOKE.md) and [RAILWAY_ACME_DEMO.md](./RAILWAY_ACME_DEMO.md).

Local:

```bash
cd demo/acme && docker compose up --build
node demo/acme/traffic.mjs --profile full --once
```

Railway: follow RAILWAY_ACME_DEMO.md; then `node demo/acme/scripts/smoke-test.mjs --once` with public `STOREFRONT_URL`.
