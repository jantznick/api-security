# Marketing plan

Product truth: [PRODUCTIZATION.md](./PRODUCTIZATION.md). Install detail: [INTEGRATING.md](./INTEGRATING.md). Public sites live in-repo:

| Surface | Path | Host |
| --- | --- | --- |
| Marketing | [`marketing/`](../marketing/) | `apiglimpse.com` |
| Docs | [`docs-site/`](../docs-site/) | `docs.apiglimpse.com` |
| Dashboard | [`frontend/`](../frontend/) | `app.apiglimpse.com` |

Deploy settings: [RENDER.md](./RENDER.md). Nick deploys to Render; this doc is IA + content truth.

Traffic-based **observe → inventory → risk**: Express middleware → API Glimpse cloud → dashboard inventory / schemas / signals. Async sampling, schemas and signals (not raw bodies), API-key gated.

---

## Locked decisions

| Decision | Choice |
| --- | --- |
| **Brand name** | **LOCKED: API Glimpse** |
| **Primary domain** | **`apiglimpse.com`** (purchased) |
| **Dashboard host** | **`app.apiglimpse.com`** (Render today on `*.onrender.com`; custom domain later) |
| **Collector / API hosts** | Planned: **`collect.apiglimpse.com`** (agent), **`api.apiglimpse.com`** (core) — see [PRODUCTIZATION.md](./PRODUCTIZATION.md). Soft-launch may keep Railway `*.up.railway.app` until DNS is wired |
| **Marketing vs app** | **Separate marketing site** from the dashboard SPA |
| **Signup** | **Open self-serve** OK — will not market heavily yet; honest soft-launch tone |
| **Billing / pricing page** | Deferred (Stripe later). Soft-launch uses ops quota, not a plan grid |

### Soft-launch control (not marketing)

**`ENDPOINT_LIMIT`** already exists on ingest:

- Env var on the **ingest** service
- Implemented in [`ingest/routes/inventory.js`](../ingest/routes/inventory.js) (`endpointLimit()`)
- Documented in `.env.example`, [ARCHITECTURE.md](./ARCHITECTURE.md), [PRODUCTIZATION.md](./PRODUCTIZATION.md)
- **`0` or unset = unlimited**; positive integer = skip *new* endpoints over the cap (existing endpoints still update)

Use this as a **soft-launch / beta ops control**, not as something to explain on a pricing page. Marketing copy can say inventory may be capped in early access if useful — do not invent plan tiers yet.

---

## Page inventory (implemented in `marketing/`)

| Page | Purpose |
| --- | --- |
| **/** Landing | Position the product, earn trust, one primary CTA |
| **/how-it-works** | Middleware → API Glimpse → inventory without architecture overload |
| **/get-started** | Install summary → links to `docs.apiglimpse.com` |
| **/pricing** | Free / Pro from `GET /api/billing/plans` when `VITE_API_URL` is set; soft placeholder (no fake $) if API missing |
| **/docs** | Redirects to `/get-started` (canonical developer docs are on the docs site) |
| **/privacy** | No raw bodies; what is stored (schemas/signals); retention high-level |
| **/terms** (lightweight) | Soft-launch ToS stub while registration is open |
| **404** | Brand-consistent dead end → home / app |

Invite-only **/early-access** is optional and **not** the current path (open signup is locked).

### Local / Render (marketing)

```bash
cd marketing && npm install && npm run dev
```

| Render setting | Value |
| --- | --- |
| Root directory | `marketing` |
| Build | `npm install && npm run build` |
| Publish | `dist` |
| Env | `VITE_APP_URL`, `VITE_DOCS_URL`, optional `VITE_COLLECT_URL` |
| Rewrite | `/*` → `/index.html` (SPA) |

Docs site: root `docs-site`, build `npm install && npm run build`, publish `docs/.vitepress/dist`. Details in [RENDER.md](./RENDER.md).

---

## Information architecture

```mermaid
flowchart LR
  V[Visitor] --> L[Landing]
  L -->|Primary CTA| R["Register on app.apiglimpse.com"]
  R --> P[Create project + API key]
  P --> I[Install middleware]
  I --> D[Inventory in dashboard]
  L -->|Secondary CTA| G[Get started / docs]
  G --> I
  G -->|Deep link| INT[INTEGRATING.md / npm]
  L --> H[How it works]
  H --> G
  L --> Priv[Privacy]
```

**Journey A — Visitor → signup**  
Landing → value + trust → **Sign up** → `app.apiglimpse.com` register → create project → copy key → install.

**Journey B — Visitor → docs/install**  
Landing or nav → Get started → npm + env → dashboard for key → verify inventory.

**Nav (shallow):** Product / How it works / Pricing / Docs / Sign in · Sign up. Pricing stays honest — API catalog or soft placeholder, never invented Stripe prices.

---

## CTAs

| CTA | Target |
| --- | --- |
| **Primary — Sign up** | `https://app.apiglimpse.com` register |
| **Sign in** | Same app origin, login |
| **Secondary — Get started / Docs** | Marketing `/docs` or `/get-started` → deep link to [INTEGRATING.md](./INTEGRATING.md) / npm |
| Agent URL | Belongs in install docs / onboarding, not necessarily the hero |

Until custom domains are wired, CTAs may point at the live Render dashboard origin. Do not mix marketing chrome into the dashboard SPA.

---

## Content blocks (outline only)

### Landing (`/`)

1. Brand hero — **API Glimpse** + one line (see the live API surface from real traffic)
2. Single CTA group — Sign up · Docs · Sign in (nav)
3. How it works (3 steps) — middleware → traffic → inventory & signals
4. Trust — Express install; schemas & signals; API keys; stays off the critical path
5. Who it’s for — Express teams who want a live map of their API
6. Soft-launch honesty — early product; endpoint limits may apply; billing later (no fake price grid)
7. Footer — Privacy, Terms, Docs, contact

### How it works / Get started / Privacy

Customers configure `API_SENSOR_AGENT_URL` + `API_SENSOR_KEY`; install middleware; dashboard shows endpoints, schemas, signals. Privacy states processed vs stored and that raw bodies are not kept as long-lived records.

---

## Deferred

- Full paid **checkout UX polish** / invoice PDFs (Stripe portal covers manage for now)
- Blog, changelog factory, SEO content mill
- Competitor matrices or “like X” positioning
- Case studies, ROI calculators, enterprise RFP packs
- Multi-language connector marketing (Express-first)
- Protect-mode / blocking messaging ([PROTECT_MODE.md](./PROTECT_MODE.md) — not v1)
- Marketing analytics suite, A/B hero tests
- In-app marketing routes inside the dashboard SPA
- Waitlist CRM (open signup is locked)

---

## Design constraints

Implemented in `marketing/` (forest-teal direction; Syne + Figtree + IBM Plex Mono via Google Fonts):

- Brand-first hero (product name dominant); one composition per first viewport
- No generic AI purple / cream-serif tropes; no card-heavy heroes
- Full-bleed surface-map visual (endpoint discovery context)
- Expressive typography (avoid Inter / system-default stacks)
- Motion for hierarchy (brand rise, path draw, subtle drift)
- Cards only where interaction needs a container

Name is locked — public surfaces use **API Glimpse**, not `api-security`.

---

## Relation to existing surfaces

| Marketing | Existing |
| --- | --- |
| Sign up / Sign in | Render dashboard (`frontend/`) → Railway core sessions |
| Install | Short marketing summary + canonical [INTEGRATING.md](./INTEGRATING.md) |
| Product truth | [PRODUCTIZATION.md](./PRODUCTIZATION.md) — middleware → API Glimpse cloud → dashboard |
| Endpoint limits | Ingest `ENDPOINT_LIMIT` (ops / early access), not a pricing story |

Marketing’s job ends at register or install docs. Onboarding (project → key → snippet) stays in-app.

### Next step: npm / package rename

Customer install is **`@apiglimpse/middleware`** (and `@apiglimpse/shared`). Publish to npm, keep INTEGRATING / docs-site / marketing install CTAs in sync with the published version.

Other rename follow-ons (not done yet): email `from@` / Resend domain on `apiglimpse.com`, repo/org rename if desired, Docker Compose service names, internal package.json names.

---

## Rejected / considered names (archive)

Nick’s bar: **names with meaning** (e.g. Traceable = follow the trail; Contrast = contrasting agent) — short, sayable, brandable. Tone: Traceable-level clarity + Contrast-level cleverness, but **warmer / punchier / more product-y** (Linear · Vercel · Sentry energy), not Latin lab coats. Avoid SecureShield / CloudGuard theater names.

**Locked choice:** **API Glimpse** — see “Glimpse” below (quick look that doesn’t keep the thing / see the live surface without storing requests). Domain: **`apiglimpse.com`**.

**Prior top picks set aside as too stuffy:** Contour, Aperture, Fathom (and the same-register thesaurus set — Assay, Silhouette, Specular, Meridian, Gnomon, Lucent, Umbra, etc.).

### Round 2 shortlist (considered, not chosen)

★ = were top recommendations before lock.

| | Name | Meaning | Why it was considered |
| --- | --- | --- | --- |
| ★ | **Imprint** | Mark left after contact | Traffic passes; only schemas/signals stick — observe-without-storing in one word |
| ★ | **Waymark** | Trail marker on a path | Marks routes real traffic actually takes; Traceable-warm, not academic |
| ★ | **Glimpse** → **API Glimpse** | A quick look that doesn’t keep the thing | **Chosen** — see the live surface without storing requests; friendly and sayable |
| ★ | **Tracelet** | Coinage: little tracer | Soft Traceable sibling — follow live calls, product-y made word |
| | **Wake** | Trail left behind a moving object | Requests move on; the wake *is* the discovered API surface |
| | **Sketch** | Rough outline of a form | Inventory as outline, not capture — shape of the API, not the bodies |
| | **Roster** | Who’s actually on the list | Punchy “what showed up in traffic” inventory energy |
| | **Spool** | Thread wound as it runs | Traffic winds through; you keep the wire’s shape, not the bytes |
| | **Clearcut** | Unambiguous / laid bare | Honest visible surface — Contrast cleverness, zero theater |
| | **Barewire** | Exposed wiring (coinage vibe) | See the bare wires of the real API from live traffic |
| | **Etch** | Engrave by contact | Permanent-feeling schema marks from transient requests |
| | **Ghostprint** | Print of what’s half-visible | Shadow-API adjacent without saying “shadow”; imprint of undocumented routes |

**Soft / secondary (usable, not lead):** Peek, Flare, Hitch, Rub (charcoal-rubbing of a surface — clever, maybe too obscure), Signpost, Tally, Speck, Afterimage (long), Livewire (**skip** — Laravel Livewire collision).

**Still not primary:** reusing **Contrast** ([Contrast Security](https://www.contrastsecurity.com/) owns AppSec) or **Traceable** — inspiration only.

### Former top-4 pitches (historical)

1. **Imprint** — Traffic touches your stack; only the shape sticks.
2. **Waymark** — Trail markers for every route real traffic actually takes.
3. **Glimpse** — See the live API surface without keeping the requests. → **locked as API Glimpse**
4. **Tracelet** — A light tracer for what’s really calling your APIs.

---

## Open / follow-ons

1. ~~Lock product name~~ → **API Glimpse** / **apiglimpse.com**
2. ~~Marketing + docs static apps~~ → `marketing/`, `docs-site/` (Nick deploys on Render)
3. Trademark / social handle check still wise (adjacent AppSec brands).
4. Publish npm (`@apiglimpse/*`) so install CTAs are honest.
5. Wire custom domains (`apiglimpse.com` / `docs` / `app` / `collect` / `api`) when ready — DNS purchase done; deploy/DNS config is ops.
