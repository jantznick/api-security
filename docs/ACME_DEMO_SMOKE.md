# Acme demo — smoke test checklist

Run after **local Docker** or **Railway** deploy. For Railway variable matrix see [RAILWAY_ACME_DEMO.md](./RAILWAY_ACME_DEMO.md).

---

## Automated smoke

```bash
# Public storefront-api (required)
export STOREFRONT_URL=https://<storefront-api>.up.railway.app   # or http://localhost:4011

# Optional — full chain health via internal URLs (Railway only, from a service shell)
export COMMERCE_URL=http://commerce-api.railway.internal:4012
export FULFILLMENT_URL=http://fulfillment-api.railway.internal:4013
export LEDGER_URL=http://ledger-api.railway.internal:4014

node demo/acme/scripts/smoke-test.mjs --once
node demo/acme/traffic.mjs --profile full --once
node demo/acme/traffic.mjs --profile partial --once
```

Expected: all health checks pass; full profile returns 200s; partial skips checkout (by design).

---

## Manual dashboard smoke (~15 min)

### A. Prerequisites

- [ ] Logged in to dashboard (`app.apiglimpse.com` or local `:5173`)
- [ ] Project **Acme Demo** with 5 services named per baseline
- [ ] Baseline uploaded at **Projects → Acme Demo → Topology**
- [ ] Railway (or local compose) stack healthy

### B. Generate traffic

```bash
export STOREFRONT_URL=<public storefront-api URL>
node demo/acme/traffic.mjs --profile full --once
```

Wait **30–60 seconds** for agent flush → ingest → dashboard.

### C. Inventory (per service)

| Service | Check | Pass? |
| --- | --- | --- |
| `storefront-api` | `POST /api/auth/login`, `POST /api/checkout` appear | [ ] |
| `storefront-api` | Callers: `mobile-app`, `web-storefront` or `storefront-api` | [ ] |
| `commerce-api` | `POST /api/users` with **sensitive signals** (email, ssn) | [ ] |
| `fulfillment-api` | `POST /api/orders` with card signal | [ ] |
| `ledger-api` | `POST /api/ledger/entries`, shadow `/internal/debug/export` | [ ] |

### D. Topology compare (project level)

Open `/projects/<projectId>/topology` → **Refresh compare**

| Check | Expected | Pass? |
| --- | --- | --- |
| Summary matched | ≥ 4 service edges green | [ ] |
| `storefront-api → commerce-api` | matched | [ ] |
| `commerce-api → fulfillment-api` | matched (after full traffic) | [ ] |
| `fulfillment-api → ledger-api` | matched | [ ] |
| External `mobile-app → storefront-api` | matched | [ ] |
| Drift events | May show shadow for legacy pricing | [ ] |

Run partial profile → refresh compare:

| Check | Expected | Pass? |
| --- | --- | --- |
| `commerce-api → fulfillment-api` | **missing** or stale (if no recent checkout) | [ ] |

### E. Sales call rehearsal

- [ ] `--profile full --once` before call (pre-warm)
- [ ] Topology page loaded in browser tab
- [ ] `--profile partial --once` live during call for missing-edge story
- [ ] Evidence export downloads from one service

---

## Local agent handoff

When you pick this up locally:

1. **Merge** PR #52 (or branch `cursor/sales-demo-plan-effc`) to `main`
2. **Deploy product** — ensure backend migration + Render dashboard with topology UI
3. **Follow** [RAILWAY_ACME_DEMO.md](./RAILWAY_ACME_DEMO.md) steps 1–5
4. **Run** automated smoke above
5. **Set** Render `VITE_ACME_DEMO_*` vars (optional)
6. **Complete** manual checklist section C–E

Blockers → note in PR or `docs/NEXT_STEPS.md`.

---
