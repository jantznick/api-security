# Render deployment (static sites)

Three **Static Site** services on **Render**. Core API, agent, ingest, and Postgres stay on **Railway** — see [RAILWAY.md](./RAILWAY.md).

**Start here for the full checklist:** [DEPLOY.md](./DEPLOY.md).

| Site | Repo root | Intended host | Notes |
| --- | --- | --- | --- |
| **Dashboard** | `frontend/` | `app.apiglimpse.com` | Session SPA → Railway core |
| **Marketing** | `marketing/` | `apiglimpse.com` | Brand site; CTAs to app + docs |
| **Docs** | `docs-site/` | `docs.apiglimpse.com` | VitePress developer docs |

Platform URLs (`*.onrender.com`) work until custom domains are attached.

---

## Dashboard (`frontend/`)

### Service settings

| Setting | Value |
| --- | --- |
| Type | **Static Site** |
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |
| Environment | Build-time `VITE_API_URL` |
| SPA rewrite (if needed) | `/*` → `/index.html` |

### Executable runbook

1. Render Dashboard → **New** → **Static Site**
2. Connect this GitHub repo
3. **Root Directory:** `frontend`
4. **Build Command:** `npm install && npm run build`
5. **Publish Directory:** `dist`

### Build environment

| Key | Value |
| --- | --- |
| `VITE_API_URL` | Public core URL: `https://api.apiglimpse.com` or Railway `https://….up.railway.app` |

Notes:

- No trailing slash required.
- Do **not** append `/api` unless you want to; the client appends `/api` if missing ([`frontend/src/api/api.js`](../frontend/src/api/api.js)).
- Vite inlines `VITE_*` at **build** time — changing the URL requires a **rebuild**.

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
3. Browser Network tab: API calls go to the core host with cookies
4. Create a project → mint API key

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

### Build environment

| Key | Default / example | Required? |
| --- | --- | --- |
| `VITE_APP_URL` | `https://app.apiglimpse.com` | Optional (has default) |
| `VITE_DOCS_URL` | `https://docs.apiglimpse.com` | Optional (has default) |
| `VITE_COLLECT_URL` | `https://collect.apiglimpse.com` | Optional — install snippets |

Copy from [`marketing/.env.example`](../marketing/.env.example). Until DNS is live, `VITE_APP_URL` may point at the dashboard `*.onrender.com` URL.

### SPA rewrite (required)

Client-side routes (`/how-it-works`, `/privacy`, etc.) need a **Rewrite** on the Render static site:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | **Rewrite** |

Without this, deep links 404 on refresh.

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

VitePress static site for **docs.apiglimpse.com**.

| Setting | Value |
| --- | --- |
| Type | **Static Site** |
| Root directory | `docs-site` |
| Build command | `npm install && npm run build` |
| Publish directory | `docs/.vitepress/dist` |

No required build env vars (app/marketing links use `apiglimpse.com` hosts in the VitePress config). Local search is enabled via VitePress `local` provider.

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
5. Rebuild dashboard with `VITE_API_URL=https://api.apiglimpse.com` (after Railway core domain is attached)
6. Rebuild marketing if CTA hosts changed; set `VITE_COLLECT_URL=https://collect.apiglimpse.com` when useful

---

## Related

- [DEPLOY.md](./DEPLOY.md) — full deploy checklist
- [RAILWAY.md](./RAILWAY.md) — backend services + deploy order
- [MARKETING.md](./MARKETING.md) — marketing IA + site paths
