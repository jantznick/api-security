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

**[Deploy](docs/DEPLOY.md)** — end-to-end Railway + Render + DNS + npm. Detail: [RAILWAY.md](docs/RAILWAY.md), [RENDER.md](docs/RENDER.md).

## Quick start

Nick verifies manually — see **[docs/TESTING.md](docs/TESTING.md)** for the full step-by-step.

High level:

1. `docker-compose up -d` — Postgres + collector
2. Core + ingest + frontend via `npm run dev` in each package
3. Create a project in the dashboard → copy API key into **demo/app** env only
4. Hit demo routes → inventory appears within seconds

## Repo layout

| Path | Role |
| --- | --- |
| `backend/` | Core API: auth, projects, inventory reads (Express + Prisma) |
| `ingest/` | Ingest API: API-key upserts |
| `frontend/` | Dashboard (Vite + React + Tailwind v4) → **Render** → `app.apiglimpse.com` |
| `marketing/` | Marketing site (Vite + React) → **Render** → `apiglimpse.com` |
| `docs-site/` | Developer docs (VitePress) → **Render** → `docs.apiglimpse.com` |
| `packages/middleware` | Express `apiSensor()` sensor (npm: `@apiglimpse/middleware`) |
| `packages/shared` | Sample envelope + redaction |
| `agent/` | Dockerized collector/processor |
| `demo/express-app/` | Sample app with one-line middleware |
| `docker-compose.yml` | Postgres + collector only |

## Docs

**Customer-facing**

- [Integrating into an existing app](docs/INTEGRATING.md) — Express middleware + npm publish (canonical; also published via `docs-site/`)
- Marketing site: `marketing/` → `apiglimpse.com`
- Developer docs: `docs-site/` → `docs.apiglimpse.com`

**Internal / ops**

- **[Deploy](docs/DEPLOY.md)** — production checklist (Railway, Render, DNS, npm, verify)
- [Railway](docs/RAILWAY.md) — Postgres / ingest / collector / core detail
- [Render](docs/RENDER.md) — static dashboard, marketing, and docs sites
- [Productization](docs/PRODUCTIZATION.md) — product shape, phases, launch checklist
- [Marketing](docs/MARKETING.md) — site IA, CTAs; brand **API Glimpse**
- [Architecture](docs/ARCHITECTURE.md) — components and data flow
- [Decisions](docs/DECISIONS.md) — why these defaults
- [Testing](docs/TESTING.md) — manual verification checklist
- [Protect mode hooks](docs/PROTECT_MODE.md) — designed for later; not blocking in v0

## Stack

Email/password + magic link, `express-session` + `connect-pg-simple`, Vite + React + Tailwind v4, Docker for infra, `npm run dev` for local app processes.
