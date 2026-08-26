# Decisions

Record of POC defaults and why.

## Product: observe → inventory → risk (not firewall-first)

Wallarm-style API firewall is a **future optional enforcement backend** (feed it generated OpenAPI). The POC centers discovery: capture → process → persist inventory/signals.

## Self-hosted agent first

~~Traceable-style customer agent.~~ **Superseded:** product path is **hosted multi-tenant agent** (Noname-style). Customers point middleware at our collector. Customer-hosted agent is an explicit non-goal. See [PRODUCTIZATION.md](./PRODUCTIZATION.md).

## Separate ingest from core

| Surface | Auth | Role |
| --- | --- | --- |
| Core | Session cookie | Humans, dashboard reads, project/API key management |
| Ingest | API key | Machine writes from agent |

Same Postgres. Two Express entrypoints so ingest stays independently scalable/securable when productizing.

In production the **agent is public**; **ingest is private** (Railway internal). Middleware never calls ingest. The agent validates keys via ingest introspect (cached) before accepting samples, and keeps **per-project** aggregators.

Prisma schema lives in `backend/prisma/` and is shared. Two generators (`client` + `ingestClient`) ensure `prisma generate` populates both packages’ `node_modules` — a single default generate only lands under backend and leaves ingest with an uninitialized client.

## Production migrations = migrate-on-boot

There is no separate migrate job. On merge to `main`, Railway redeploys **core** and **ingest**; both run `prisma migrate deploy` via `npm start` (`backend/scripts/safe-migrate.js`) before listening. Deploy is idempotent (Prisma advisory lock), so parallel boots are safe. Local/dev still uses `npx prisma migrate deploy` once when bringing up Postgres.

## Fail-open middleware

Discovery must never take down the customer app. Sensor catches errors, uses a circuit breaker, and drops samples if the agent is unreachable.

## No raw traffic storage

Postgres holds schemas, counters, and signal tags only. Samples exist briefly in agent memory. Middleware redacts secrets before leave-app.

## Path templating heuristics (not ML)

Stable templates via UUID / numeric / hex / email / opaque-token classifiers plus a static vocabulary so `/users/1` and `/users/2` collapse without turning `/api/v1/health` into noise.

## Schema merge that converges

Required = intersection across observations; types widen to unions; property fan-out capped. Agent merges in memory before upsert; ingest stores the latest merged fragment.

## Vacation-home auth & DX

Email/password + magic link (6-digit + UUID), `express-session` + `connect-pg-simple`, Vite + React + Tailwind v4, Docker for Postgres (+ agent here), `npm run dev` for app processes. Borrowed so effort stays on the agent.

## Node/JS ESM for the agent (POC)

Same language as middleware/shared for one envelope type and fast iteration. Revisit Go only if CPU becomes the bottleneck.

## Protect mode deferred

Blocking is designed for (local policy cache, fail-open default) but **not implemented** in v0. See [PROTECT_MODE.md](./PROTECT_MODE.md).

## Out of scope for v0

- Runtime blocking / ModSecurity / Wallarm in-path
- eBPF, Java/.NET agents, Envoy filters
- Storing or replaying full traffic
- Fancy ML classifiers
- Multi-region SaaS control plane
- OpenAPI export (stretch; not required for demo)

## Multi-seat SaaS hierarchy (planned)

Soft launch stays **User → Project**. Next tenancy model (not shipped yet): **Organization → Project → Service**, with org-scoped RBAC and billing moving to the org. Plan of record: [SAAS_PLAN.md](./SAAS_PLAN.md). Do not invent a second hierarchy in ad-hoc PRs.

## Gateway discovery: Nginx / Kong first (SF5)

**Decision (Nick, 2026-08-26):** Prefer **Nginx (OpenResty Lua)** or **Kong** at the edge for discovery without per-app SDKs. A Node reverse-proxy sidecar (`@apiglimpse/gateway-proxy`) remains available for local/dev and non-Lua shops.

**Why:** Matches how enterprise traffic already flows; easier install story for platform teams; same envelope v1 as app connectors.

**Topology:** Callers should set `API_SENSOR_SERVICE_NAME` or `X-Service-Name` for quality edges (UA-only is fallback noise).

**Non-goals for v1:** Full body capture at the gateway, protect enforcement inside Kong/Nginx (use app middleware protect MVP or external WAF).
