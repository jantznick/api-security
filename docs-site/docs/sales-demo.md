---
title: Sales demo (Acme stack)
---

# Sales demo — Acme Retail stack

Five instrumented services demonstrate multi-hop topology, sensitive-field classification, and **baseline vs observed** architecture compare.

## Repo

- Apps: `demo/acme/` in the [GitHub repo](https://github.com/jantznick/api-security/tree/main/demo/acme)
- Baseline format: [topology baseline](/concepts) — see internal `docs/TOPOLOGY_BASELINE.md` in repo

## Topology

```text
web-storefront → storefront-api → commerce-api → fulfillment-api → ledger-api
                       ↑ mobile-app, partner-billing (simulated traffic)
```

## Deploy

Production demo runs on **Railway** (separate project from API Glimpse prod). Full runbook: `docs/RAILWAY_ACME_DEMO.md` in the repo.

After deploy, smoke test:

```bash
export STOREFRONT_URL=https://<your-storefront-api>.up.railway.app
node demo/acme/scripts/smoke-test.mjs --once
```

## Dashboard

1. Create project **Acme Demo** with five services matching baseline node names
2. Open **Topology** → upload `demo/acme/baseline-topology.json`
3. Run traffic → **Refresh compare** for matched / missing / shadow edges

## Traffic profiles

```bash
node demo/acme/traffic.mjs --profile full --once    # full chain + drift seeds
node demo/acme/traffic.mjs --profile partial --once  # missing edge demo
```

See `demo/acme/README.md` in the repo for the AE call script.
