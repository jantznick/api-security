# API Glimpse

Traffic-based **observe → inventory → risk**: Express middleware samples live traffic, API Glimpse cloud builds inventory, and the dashboard shows endpoints, schemas, and signals.

**Brand:** [API Glimpse](https://apiglimpse.com) · dashboard `app.apiglimpse.com` · collector `collect.apiglimpse.com` · API `api.apiglimpse.com`.

```
Your Express app
  → API Glimpse middleware (samples + API key)
    → API Glimpse cloud (validate key, per-project aggregate)
  → Inventory store (schemas + signals — not raw bodies)
  → Dashboard (session auth)
```

**[Deploy](docs/DEPLOY.md)** — end-to-end Railway + Render + DNS + npm. Detail: [RAILWAY.md](docs/RAILWAY.md), [RENDER.md](docs/RENDER.md). **[npm publish](docs/NPM_PUBLISH.md)** — first-time `@apiglimpse/*` publish.
## Quick start

Nick verifies manually — see **[docs/TESTING.md](docs/TESTING.md)** for the full step-by-step. Short local-dev notes: **[docs/DEPLOY.md#local-dev](docs/DEPLOY.md#local-dev)**.

High level:

1. `docker-compose up -d` — Postgres + collector
2. Core + dashboard via `npm run dev` (marketing optional for app-only auth)
3. Create a project in the dashboard → copy API key into **demo/app** env only
4. Hit demo routes → inventory appears within seconds

### Local dashboard (minimum)

```bash
# Once: copy env examples, install, migrate
cd backend && cp .env.example .env && npm install && npx prisma generate && npx prisma migrate deploy
cd ../frontend && cp .env.example .env && npm install

# Terminals
cd backend && npm run dev    # http://localhost:3001
cd frontend && npm run dev   # http://localhost:5173 — welcome + AuthModal
```

Both marketing and the dashboard open a tabbed AuthModal (Sign in | Create account). Marketing (`:5174`) is optional for local app-only auth; set `VITE_API_URL=http://localhost:3001` on both when testing cross-origin cookies.

## Repo layout

| Path | Role |
| --- | --- |
| `backend/` | Core API: auth, projects, inventory reads (Express + Prisma) |
| `ingest/` | Ingest API: API-key upserts |
| `frontend/` | Dashboard (Vite + React + Tailwind v4) → **Render** → `app.apiglimpse.com` |
| `marketing/` | Marketing site (Vite + React) → **Render** → `apiglimpse.com` |
| `docs-site/` | Developer docs (VitePress) → **Render** → `docs.apiglimpse.com` |
| `packages/middleware` | Public SDK — Express middleware (npm: `@apiglimpse/middleware`) |
| `packages/shared` | Internal helpers for middleware (npm: `@apiglimpse/shared`) |
| `agent/` | Dockerized collector/processor |
| `demo/express-app/` | Sample app with one-line middleware |
| `docker-compose.yml` | Postgres + collector only |

## Docs

**Customer-facing**

- [Integrating into an existing app](docs/INTEGRATING.md) — Express middleware (canonical; also published via `docs-site/`)
- Marketing site: `marketing/` → `apiglimpse.com`
- Developer docs: `docs-site/` → `docs.apiglimpse.com`

**Internal / ops**

- **[Deploy](docs/DEPLOY.md)** — production checklist (Railway, Render, DNS, npm, verify)
- **[npm publish](docs/NPM_PUBLISH.md)** — first-time publish of `@apiglimpse/shared` and `@apiglimpse/middleware`
- [Railway](docs/RAILWAY.md) — Postgres / ingest / collector / core detail
- [Render](docs/RENDER.md) — static dashboard, marketing, and docs sites
- [Productization](docs/PRODUCTIZATION.md) — product shape, phases, launch checklist
- [SaaS plan](docs/SAAS_PLAN.md) — account/usage UX, Org→Project→Service, teams + RBAC
- [Marketing](docs/MARKETING.md) — site IA, CTAs; brand **API Glimpse**
- [Marketing GTM plan](docs/MARKETING_PLAN.md) — positioning, ads, channels, multi-agent streams **M0–M8**; security-platform north star
- [Marketing-ready product plan](docs/MARKETING_READY.md) — dev streams **R1–R6** to clear soft-launch / acquisition bar
- [**Nick’s next steps**](docs/NEXT_STEPS.md) — **single checklist**: Resend, publish, Stripe, analytics, LinkedIn/Google
- [Org plan-limit snapshots](docs/ORG_PLAN_LIMITS.md) — catalog edits vs org entitlements
- [Architecture](docs/ARCHITECTURE.md) — components and data flow
- [Decisions](docs/DECISIONS.md) — why these defaults
- [Testing](docs/TESTING.md) — manual verification checklist
- [Protect mode](docs/PROTECT_MODE.md) — future opt-in blocking **PM0–PM4**; designed for later, not v0

## Stack

Email/password + magic link, `express-session` + `connect-pg-simple`, Vite + React + Tailwind v4, Docker for infra, `npm run dev` for local app processes.
