# Topology baseline & drift format (SF9)

**Version:** `1`  
**Scope:** Project-level architecture baseline import, observed-graph roll-up, and drift events/alerts.

Related: [SALES_DEMO_PLAN.md](./SALES_DEMO_PLAN.md), SF3 `TrafficEdge`, SF2 `InventoryEvent`.

---

## Overview

| Artifact | Purpose |
| --- | --- |
| **Baseline document** | What the team *believes* the architecture is (uploaded JSON) |
| **Observed graph** | Derived from live `TrafficEdge` rows across all Services in a Project |
| **Compare result** | `matched` / `missing` / `shadow` edges and callers |
| **Drift events** | Durable records when compare finds new missing/shadow items |

Granularity for v1 is **service-to-service** (and **external caller → service**). Endpoint-level diff remains OpenAPI/inventory territory.

---

## Baseline document (`topology-baseline.v1.json`)

```json
{
  "version": 1,
  "metadata": {
    "name": "Acme Retail",
    "description": "Architecture review Q3",
    "updatedAt": "2026-08-26T00:00:00.000Z"
  },
  "nodes": [
    {
      "id": "storefront-api",
      "label": "Storefront API",
      "tier": "public",
      "instrumented": true
    },
    {
      "id": "ledger-api",
      "label": "Ledger API",
      "tier": "internal",
      "instrumented": true
    }
  ],
  "edges": [
    {
      "id": "storefront-to-commerce",
      "from": "storefront-api",
      "to": "commerce-api",
      "label": "checkout fan-out"
    }
  ],
  "externalCallers": [
    {
      "id": "mobile-app",
      "label": "Mobile App",
      "targets": ["storefront-api"]
    }
  ]
}
```

### Field rules

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | Must be `1` for this spec |
| `nodes[].id` | yes | Stable slug; **must match** dashboard `Service.name` when `instrumented: true` |
| `nodes[].tier` | no | `public` \| `private` \| `internal` — display only in v1 |
| `nodes[].instrumented` | no | Default `true`; `false` = diagram-only node (not expected in traffic) |
| `edges[].from` / `to` | yes | Must reference `nodes[].id` |
| `edges[].id` | no | Stable id for drift payloads; auto-generated if omitted |
| `externalCallers[].targets` | no | Default: all `tier: public` nodes |

Validation: `@apiglimpse/shared` → `validateTopologyBaseline()`.

---

## Observed graph (derived, not uploaded)

Built by the core API from `TrafficEdge` + `Service.name`:

```json
{
  "version": 1,
  "generatedAt": "2026-08-26T12:00:00.000Z",
  "projectId": "uuid",
  "nodes": [
    { "id": "commerce-api", "label": "commerce-api", "serviceId": "uuid", "instrumented": true }
  ],
  "edges": [
    {
      "from": "storefront-api",
      "to": "commerce-api",
      "hitCount": 42,
      "lastSeenAt": "2026-08-26T11:59:00.000Z",
      "samples": [{ "method": "POST", "pathTemplate": "/api/checkout" }]
    }
  ],
  "externalCallers": [
    {
      "id": "mobile-app",
      "label": "mobile-app",
      "to": "storefront-api",
      "hitCount": 12,
      "callerKey": "svc:mobile-app"
    }
  ]
}
```

### Edge derivation rules

1. For each `TrafficEdge` on service **S** (`S.name` = target node id):
   - If `callerKey` is `svc:<name>` → internal edge `<name> → S.name`
   - Else → external caller edge `callerLabel → S.name`
2. Aggregate `hitCount` and keep up to 3 sample `(method, pathTemplate)` pairs per edge.
3. Ignore edges where target service is unknown or caller is empty.

---

## Compare result (`topology-compare.v1.json`)

```json
{
  "version": 1,
  "comparedAt": "2026-08-26T12:00:00.000Z",
  "projectId": "uuid",
  "summary": {
    "matched": 4,
    "missing": 1,
    "shadow": 2,
    "externalMatched": 2,
    "externalShadow": 1
  },
  "edges": [
    {
      "from": "commerce-api",
      "to": "fulfillment-api",
      "status": "missing",
      "baselineEdgeId": "commerce-to-fulfillment",
      "observedHitCount": 0
    },
    {
      "from": "storefront-api",
      "to": "legacy-pricing",
      "status": "shadow",
      "observedHitCount": 3,
      "samples": [{ "method": "GET", "pathTemplate": "/api/pricing/legacy" }]
    }
  ],
  "externalCallers": [
    {
      "callerId": "unknown-vendor",
      "to": "storefront-api",
      "status": "shadow",
      "observedHitCount": 1
    }
  ]
}
```

### Status values

| Status | Meaning |
| --- | --- |
| `matched` | In baseline and seen in traffic (hitCount > 0) |
| `missing` | In baseline, not observed (or zero hits) |
| `shadow` | Observed, not in baseline |
| `stale` | Reserved — in baseline, last seen > N days ago |

---

## Drift events (`topology.drift.v1`)

Stored in `ProjectTopologyEvent` (project-scoped). Types:

| `type` | When emitted | `driftKey` pattern |
| --- | --- | --- |
| `topology.edge.missing` | Baseline edge never observed | `edge:missing:{from}:{to}` |
| `topology.edge.shadow` | Observed edge not in baseline | `edge:shadow:{from}:{to}` |
| `topology.caller.shadow` | External caller not in baseline | `caller:shadow:{callerId}:{to}` |
| `topology.edge.resolved` | Previously missing/shadow now matched | same key as original |

### Event payload

```json
{
  "version": 1,
  "from": "commerce-api",
  "to": "fulfillment-api",
  "baselineEdgeId": "commerce-to-fulfillment",
  "status": "missing",
  "observedHitCount": 0,
  "severity": "medium",
  "message": "Documented edge commerce-api → fulfillment-api not seen in traffic"
}
```

Severity defaults:

| Condition | Severity |
| --- | --- |
| `missing` + target `tier: internal` | `high` |
| `missing` + target `tier: private` | `medium` |
| `shadow` edge into `internal` tier | `high` |
| `shadow` external caller | `medium` |
| `matched` (resolution) | `info` |

Webhook (reuse SF2 project webhook): POST `{ type, projectId, payload, createdAt }` on **new** drift only.

---

## HTTP API (core)

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/projects/:projectId/topology/baseline` | Current baseline or `null` |
| `PUT` | `/api/projects/:projectId/topology/baseline` | `{ baseline: <topology-baseline.v1> }` |
| `GET` | `/api/projects/:projectId/topology/observed` | `topology-observed.v1` |
| `GET` | `/api/projects/:projectId/topology/compare` | `topology-compare.v1`; optional `?recordDrift=1` |
| `GET` | `/api/projects/:projectId/topology/events` | List `ProjectTopologyEvent` |

---

## Demo fixture

Canonical Acme baseline: `demo/acme/baseline-topology.json` (same schema).  
Shared test fixture: `packages/shared/fixtures/acme-baseline-v1.json`.

---

## Non-goals (v1)

- Lucidchart / draw.io import
- Endpoint-level graph edges
- Auto-layout SVG requirements (simple list + adjacency is fine)
- Storing raw HAR or full request paths beyond sample hints

---
