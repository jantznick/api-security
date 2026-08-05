# API Security Discovery POC

Traffic-based **observe → inventory → risk** loop (Traceable/Noname-shaped), not a firewall-first product.

```
Demo Express app
  → fail-open middleware (samples)
  → Docker agent (normalize, schema merge, heuristics)
  → Ingest API (API key, inventory upserts only)
  → Postgres (schemas + signals — never raw bodies)
  → Dashboard (session auth)
```

## Quick start

Nick verifies manually — see **[docs/TESTING.md](docs/TESTING.md)** for the full step-by-step.

High level:

1. `docker-compose up -d` — Postgres + agent
2. Core + ingest + frontend via `npm run dev` in each package
3. Create a project in the dashboard → copy API key into agent + demo env
4. Hit demo routes → inventory appears within seconds

## Repo layout

| Path | Role |
| --- | --- |
| `backend/` | Core API: auth, projects, inventory reads (Express + Prisma) |
| `ingest/` | Ingest API: API-key upserts |
| `frontend/` | Dashboard (Vite + React + Tailwind v4) |
| `packages/middleware` | Express `apiSensor()` sensor |
| `packages/shared` | Sample envelope + redaction |
| `agent/` | Dockerized processor |
| `demo/express-app/` | Sample app with one-line middleware |
| `docker-compose.yml` | Postgres + agent only |

## Docs

- [Architecture](docs/ARCHITECTURE.md) — components and data flow
- [Decisions](docs/DECISIONS.md) — why these defaults
- [Testing](docs/TESTING.md) — manual verification checklist
- [Protect mode hooks](docs/PROTECT_MODE.md) — designed for later; not blocking in v0

## Stack

Mirrors vacation-home patterns: email/password + magic link, `express-session` + `connect-pg-simple`, Vite + React + Tailwind v4, Docker for infra only, `npm run dev` for app processes.
