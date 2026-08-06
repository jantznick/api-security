# Deploy API Glimpse

End-to-end checklist for Nick: **Railway** (Postgres, ingest, core, agent) → **Render** (dashboard, marketing, docs) → **DNS** → **npm** → **verify**.

Platform URLs (`*.up.railway.app`, `*.onrender.com`) are fine until custom domains on **apiglimpse.com** are attached. Same wiring either way.

| Host | Service |
| --- | --- |
| `apiglimpse.com` | Marketing (Render) |
| `app.apiglimpse.com` | Dashboard (Render) |
| `docs.apiglimpse.com` | Docs (Render) |
| `api.apiglimpse.com` | Core API (Railway) |
| `collect.apiglimpse.com` | Agent / collector (Railway) |

Detail for a single platform: [RAILWAY.md](./RAILWAY.md) · [RENDER.md](./RENDER.md).

---

## Prerequisites

- [ ] Repo on GitHub connected to Railway and Render
- [ ] Railway account
- [ ] Render account
- [ ] npm account with publish rights for `@apiglimpse/*`
- [ ] DNS access for `apiglimpse.com` (can finish after platform URLs work)

---

## 1. Railway

Deploy in this order. **Docker build context = repo root** for agent, ingest, and backend (`Dockerfile path` points at `agent/Dockerfile`, `ingest/Dockerfile`, `backend/Dockerfile`).

### 1.1 Postgres

1. New Railway project → **Add PostgreSQL**
2. Note `DATABASE_URL` (reference it from other services)

### 1.2 Ingest (private — no public URL)

| Setting | Value |
| --- | --- |
| Dockerfile path | `ingest/Dockerfile` |
| Build context | **Repo root** |
| Public domain | **Do not** generate |
| Private networking | On |

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres reference |
| `NODE_ENV` | `production` |
| `ENDPOINT_LIMIT` | e.g. `0` (unlimited) or a positive cap |
| `PORT` | `3002` (or Railway-assigned; note the listen port) |

Rename the service to **`ingest`** so the private host is `ingest.railway.internal`.

Healthcheck (private only):

```bash
curl -s http://ingest.railway.internal:3002/health
# {"status":"ok"}
```

Path: `GET /health`. Ingest must **not** be reachable on the public internet.

### 1.3 Core (public → `api.apiglimpse.com`)

| Setting | Value |
| --- | --- |
| Dockerfile path | `backend/Dockerfile` |
| Build context | **Repo root** |
| Public domain | Yes (`*.up.railway.app` until DNS) |
| Custom domain (later) | `api.apiglimpse.com` |

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres reference |
| `SESSION_SECRET` | Long random string |
| `FRONTEND_URL` | `https://app.apiglimpse.com` (or Render dashboard URL until DNS) |
| `NODE_ENV` | `production` |
| `COOKIE_DOMAIN` | **Leave unset** |

`npm start` runs Prisma migrate then the server.

Healthcheck:

```bash
curl -s https://<core-public>/api/health
# {"status":"ok","service":"core",...}
```

Path: `GET /api/health`. Note the public URL → Render `VITE_API_URL`.

### 1.4 Agent / collector (public → `collect.apiglimpse.com`)

| Setting | Value |
| --- | --- |
| Dockerfile path | `agent/Dockerfile` |
| Build context | **Repo root** |
| Public domain | Yes |
| Custom domain (later) | `collect.apiglimpse.com` |

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `INGEST_URL` | `http://ingest.railway.internal:<port>` (match ingest listen port) |
| `AGENT_DEBUG_BUFFER` | unset / `false` |
| Optional | `AGENT_RATE_MAX`, `AGENT_RATE_WINDOW_MS`, `AGENT_BODY_LIMIT` |

Healthcheck:

```bash
curl -s https://<agent-public>/health
# ok

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<agent-public>/v1/samples \
  -H 'Content-Type: application/json' -d '{}'
# 401
```

Path: `GET /health`.

### 1.5 Railway env summary

| Variable | Service | Notes |
| --- | --- | --- |
| `DATABASE_URL` | core, ingest | From Postgres |
| `SESSION_SECRET` | core | Required |
| `FRONTEND_URL` | core | Dashboard origin for CORS |
| `ENDPOINT_LIMIT` | ingest | Cap new endpoints (`0` = unlimited) |
| `INGEST_URL` | agent | `http://ingest.railway.internal:<port>` |
| `NODE_ENV` | all | `production` |
| `PORT` | all | Railway injects; apps read it |

Customers later:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
```

---

## 2. Render (static sites)

Three **Static Site** services. Connect the same GitHub repo.

### 2.1 Dashboard (`frontend` → `app.apiglimpse.com`)

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |
| SPA rewrite | `/*` → `/index.html` if deep links 404 |

| Build env | Value |
| --- | --- |
| `VITE_API_URL` | Public core URL (`https://api.apiglimpse.com` or Railway `*.up.railway.app`) |

No trailing slash. Changing `VITE_*` requires a **rebuild**.

Then set Railway core `FRONTEND_URL` to the dashboard origin and redeploy core if needed.

### 2.2 Marketing (`marketing` → `apiglimpse.com`)

| Setting | Value |
| --- | --- |
| Root directory | `marketing` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |
| SPA rewrite | **`/*` → `/index.html`** (required) |

| Build env | Value |
| --- | --- |
| `VITE_APP_URL` | `https://app.apiglimpse.com` (or Render dashboard URL until DNS) |
| `VITE_DOCS_URL` | `https://docs.apiglimpse.com` |
| `VITE_COLLECT_URL` | Optional — `https://collect.apiglimpse.com` or agent Railway URL |

### 2.3 Docs (`docs-site` → `docs.apiglimpse.com`)

| Setting | Value |
| --- | --- |
| Root directory | `docs-site` |
| Build command | `npm install && npm run build` |
| Publish directory | `docs/.vitepress/dist` |

No required build env vars (links use `apiglimpse.com` hosts in VitePress config).

---

## 3. DNS (`apiglimpse.com`)

Attach custom domains in each platform, then point DNS as the provider instructs (CNAME / ALIAS):

| Name | Points at |
| --- | --- |
| Apex (`apiglimpse.com`) | Marketing (Render) |
| `app` | Dashboard (Render) |
| `docs` | Docs site (Render) |
| `api` | Railway **core** |
| `collect` | Railway **agent** |

After DNS:

1. Core `FRONTEND_URL=https://app.apiglimpse.com` → redeploy if needed
2. Rebuild dashboard with `VITE_API_URL=https://api.apiglimpse.com`
3. Rebuild marketing if CTA / collect URLs changed

---

## 4. npm publish

First-time account, org, 2FA, and click-by-click steps: **[NPM_PUBLISH.md](./NPM_PUBLISH.md)**.

Publish **shared** first, then **middleware** (script swaps `file:../shared` → registry range, publishes, restores `file:`):

```bash
cd packages/shared
npm publish --access public

cd ../middleware
npm run publish:npm
```

Verify:

```bash
npm view @apiglimpse/shared version
npm view @apiglimpse/middleware version
```
---

## 5. Verify

- [ ] `GET https://api…/api/health` (or Railway core URL) → ok
- [ ] `GET https://collect…/health` (or Railway agent URL) → ok
- [ ] Ingest has **no** public URL
- [ ] Register / login on dashboard — CORS and cookies work
- [ ] Create project → copy `ask_…` key
- [ ] Hit Express app with `@apiglimpse/middleware` + agent URL + key → endpoints appear
- [ ] `POST /v1/samples` without key → **401**
- [ ] Marketing / docs / app hosts load (platform or custom domains)

---

## Related

- [RAILWAY.md](./RAILWAY.md) — Railway detail + tenancy
- [RENDER.md](./RENDER.md) — Render static site settings
- [INTEGRATING.md](./INTEGRATING.md) — Express connector
- [NPM_PUBLISH.md](./NPM_PUBLISH.md) — first-time npm publish
- [TESTING.md](./TESTING.md) — local verification
