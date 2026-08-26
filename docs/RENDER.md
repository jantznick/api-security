# Render deployment (static sites)

Three **Static Site** services on **Render**, defined in root [`render.yaml`](../render.yaml) (Blueprint). Core API, agent, ingest, and Postgres stay on **Railway** — see [RAILWAY.md](./RAILWAY.md).

**Start here for the full checklist:** [DEPLOY.md](./DEPLOY.md).

| Site | Repo root | Intended host | Blueprint `name` |
| --- | --- | --- | --- |
| **Dashboard** | `frontend/` | `app.apiglimpse.com` | `apiglimpse-dashboard` |
| **Marketing** | `marketing/` | `apiglimpse.com` | `apiglimpse-marketing` |
| **Docs** | `docs-site/` | `docs.apiglimpse.com` | `apiglimpse-docs` |

Platform URLs (`*.onrender.com`) work until custom domains are attached.

---

## Blueprint (`render.yaml`) — durable SPA rewrite

**Source of truth:** root [`render.yaml`](../render.yaml).

Each SPA service includes:

```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

That rewrite ships with the Blueprint on every sync/deploy. Hard refresh of `/projects`, `/admin`, `/billing`, `/how-it-works`, etc. serves `index.html` without anyone clicking **Redirects/Rewrites** in the Dashboard.

**Render does not read Netlify-style `_redirects` files.** Files under `frontend/public/_redirects` / `marketing/public/_redirects` are for other hosts only; they do **not** fix `app.apiglimpse.com` on Render.

### One-time: adopt Blueprint (if sites were created manually)

If the three static sites already exist outside a Blueprint:

1. Render Dashboard → **New** → **Blueprint** → connect this GitHub repo (Blueprint path: `render.yaml`, branch: `main` after merge).
2. Match Blueprint `name:` fields to existing service names — either rename the services in Render to `apiglimpse-dashboard` / `apiglimpse-marketing` / `apiglimpse-docs`, **or** edit `name:` in `render.yaml` to match current names — so Apply **updates** them instead of creating duplicates.
3. Review the diff (expect `routes` rewrite + build settings / `VITE_*`) → **Deploy Blueprint**.

After that sync, leave **Auto Sync** on. Future pushes that change `render.yaml` apply rewrites from git. **No ongoing Dashboard Redirects/Rewrites steps.**

Optional helper: select existing services in Render → **Generate Blueprint** to see their current `name` values, then align `render.yaml`.

---

## Dashboard (`frontend/`)

### Service settings (also in `render.yaml`)

| Setting | Value |
| --- | --- |
| Type | **Static Site** (`runtime: static`) |
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |
| SPA rewrite | `/*` → `/index.html` via Blueprint `routes` |

### Build environment

Set in [`render.yaml`](../render.yaml) (production defaults):

| Key | Value |
| --- | --- |
| `VITE_API_URL` | `https://api.apiglimpse.com` |
| `VITE_MARKETING_URL` | `https://apiglimpse.com` |
| `VITE_APP_URL` | `https://app.apiglimpse.com` |
| `VITE_DOCS_URL` | `https://docs.apiglimpse.com` |
| `VITE_COLLECT_URL` | `https://collect.apiglimpse.com` |

Notes:

- No trailing slash required.
- Do **not** append `/api` unless you want to; the client appends `/api` if missing ([`frontend/src/api/api.js`](../frontend/src/api/api.js)).
- Vite inlines `VITE_*` at **build** time — changing the URL requires a **rebuild** (edit `render.yaml` or Dashboard env, then redeploy).

### Wire Railway core CORS

On the Railway **core** service, allow both the dashboard and marketing origins (auth lives on marketing):

```bash
FRONTEND_URLS=https://app.apiglimpse.com,https://apiglimpse.com,https://www.apiglimpse.com
MARKETING_URL=https://apiglimpse.com
# Magic-link emails use MARKETING_URL
COOKIE_DOMAIN=.apiglimpse.com
```

Until custom domains are live (Render `*.onrender.com` → Railway `*.up.railway.app`), set `FRONTEND_URL` / `FRONTEND_URLS` to the exact Render origins and **leave `COOKIE_DOMAIN` unset**.

Redeploy core after changing these.

### Smoke

1. Open `https://apiglimpse.com/?auth=login` (or register) → sign in in the AuthModal
2. You should land on `https://app.apiglimpse.com/projects` with a session cookie
3. Hard-refresh `/projects` (and `/admin`, `/billing`) — must serve the SPA, not plain-text `404 Not Found`
4. Browser Network tab: API calls go to the core host with cookies
5. Create a project → mint API key

If login fails with CORS or missing cookies:

- Confirm `FRONTEND_URLS` (or `FRONTEND_URL` + `MARKETING_URL`) includes every browser origin exactly (scheme + host, no path)
- Confirm `COOKIE_DOMAIN=.apiglimpse.com` once `api`, `app`, and apex share `apiglimpse.com`
- Confirm core `NODE_ENV=production` (enables `secure` + `sameSite: 'none'`)
- Confirm frontend and marketing were built with the correct `VITE_API_URL`

### Local vs production (dashboard)

| | Local | Production |
| --- | --- | --- |
| API base | Vite proxy `/api` → `localhost:3001` | `VITE_API_URL` + `/api` |
| Cookies | `SameSite=Lax`, not Secure | `SameSite=None`, Secure; `COOKIE_DOMAIN=.apiglimpse.com` |
| CORS | `FRONTEND_URLS=http://localhost:5173,http://localhost:5174` | App + marketing origins |
| Auth UI | App `:5173` welcome + AuthModal; marketing `:5174` same modal | `apiglimpse.com/?auth=login` |

---

## Marketing (`marketing/`)

Vite + React SPA. See [MARKETING.md](./MARKETING.md) for IA and content rules.

| Setting | Value |
| --- | --- |
| Type | **Static Site** |
| Root directory | `marketing` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |
| SPA rewrite | Blueprint `routes` in [`render.yaml`](../render.yaml) (`/*` → `/index.html`) |

### Build environment

| Key | Default / example | Required? |
| --- | --- | --- |
| `VITE_APP_URL` | `https://app.apiglimpse.com` | In Blueprint |
| `VITE_DOCS_URL` | `https://docs.apiglimpse.com` | In Blueprint |
| `VITE_API_URL` | `https://api.apiglimpse.com` | In Blueprint — marketing login/register |
| `VITE_COLLECT_URL` | `https://collect.apiglimpse.com` | In Blueprint — install snippets |

Local copy: [`marketing/.env.example`](../marketing/.env.example). Until DNS is live, override `VITE_APP_URL` to the dashboard `*.onrender.com` URL in Dashboard or temporarily in `render.yaml`.

### Local

```bash
cd marketing
cp .env.example .env   # optional
npm install
npm run dev            # http://localhost:5173
npm run build
```

---

## Docs (`docs-site/`)

VitePress static site for **docs.apiglimpse.com** (`apiglimpse-docs` in Blueprint).

| Setting | Value |
| --- | --- |
| Type | **Static Site** |
| Root directory | `docs-site` |
| Build command | `npm install && npm run build` |
| Publish directory | `docs/.vitepress/dist` |

No SPA catch-all (VitePress emits real HTML paths). No required build env vars (app/marketing links use `apiglimpse.com` hosts in the VitePress config). Local search is enabled via VitePress `local` provider.

### Local

```bash
cd docs-site
npm install
npm run dev            # VitePress default port (usually 5173)
npm run build
```

---

## Custom domains

Brand domain: **apiglimpse.com**. Full DNS map: [DEPLOY.md](./DEPLOY.md#3-dns-apiglimpsecom).

1. Marketing static site → **`apiglimpse.com`** (and optionally `www`)
2. Docs static site → **`docs.apiglimpse.com`**
3. Dashboard static site → **`app.apiglimpse.com`**
4. Update core `FRONTEND_URL` to `https://app.apiglimpse.com`
5. Rebuild dashboard / marketing after `VITE_*` changes in `render.yaml` (Blueprint sync or manual redeploy)
6. Set `VITE_COLLECT_URL=https://collect.apiglimpse.com` when useful (already in Blueprint)

---

## Related

- [DEPLOY.md](./DEPLOY.md) — full deploy checklist
- [RAILWAY.md](./RAILWAY.md) — backend services + deploy order
- [MARKETING.md](./MARKETING.md) — marketing IA + site paths
