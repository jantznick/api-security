# Protect mode — product roadmap

**v0 / soft-launch is observe-only.** Nothing in the connectors blocks or rewrites responses today.

**North star:** API Glimpse becomes a **traffic-based API security platform**: same connectors that discover the live surface can optionally **enforce local policy** (block / allow) when the customer turns protect on—without a per-request round trip to the control plane.

Marketing must stay honest about which rung we’re on. GTM ladder: [MARKETING_PLAN.md](./MARKETING_PLAN.md#north-star-api-security-platform). Do **not** advertise blocking until a listed protect phase below is shipped and Nick unlocks claims.

This document is both the **hook sketch** (original) and the **phased product roadmap** agents can implement later.

---

## Principles (unchanged)

1. **Discovery stays fully async** — sample flush never waits on policy.
2. **Enforcement is local** — connector (middleware / agent path) evaluates a **cached policy** with a ~1–2ms budget.
3. **Fail-open by default** — if policy is missing, stale, or evaluation errors, allow the request.
4. **No per-request remote call** to the control plane for allow/deny.
5. **Protect is opt-in per service** — observe remains the default forever for customers who only want inventory.
6. **Still no long-lived raw bodies** — blocks are justified by rule + metadata, not stored payloads.

---

## Category ladder (product)

```text
observe  →  inventory  →  risk signals  →  shadow protect  →  block (opt-in)
```

| Rung | Customer value | Ship gate for marketing claims |
| --- | --- | --- |
| Observe | Samples flow; fail-open | Soft-launch (now) |
| Inventory | Endpoints + schemas in dashboard | Soft-launch (now) |
| Risk signals | Sensitive-field tags, auth hints | Soft-launch (now, keep modest) |
| Shadow protect | “Would have blocked” without denying | After **PM1** |
| Block | Opt-in deny in connector | After **PM2** + docs + fail-open proof |
| Platform narrative | “API security platform” in ads | After **PM2** stable + Nick unlock |

---

## Suggested hook points (connectors)

```js
app.use(apiSensor({
  agentUrl,
  apiKey,
  // Future:
  // protect: {
  //   enabled: false,
  //   mode: 'observe' | 'shadow' | 'block',
  //   policyUrl: '...',       // periodic pull (or via agent)
  //   failMode: 'open',       // default — never 'closed' as product default
  //   onDeny: (ctx) => res.status(403).json({ error: 'blocked' }),
  // },
}))
```

Before `next()` (or language equivalent):

1. Load policy snapshot from memory (refreshed every N seconds from control plane or agent).
2. Match `(method, pathTemplate)` + optional schema/signal rules.
3. If `mode === 'shadow'` and rule matches → allow, attach `wouldBlock: true` on the sample.
4. If `mode === 'block'` and rule matches → deny; still enqueue sample with `blocked: true` asynchronously.
5. Else continue; always keep discovery async.

Same shape for Fastify, FastAPI, Go chi — shared policy JSON, language-local evaluators.

### Policy cache shape (sketch)

```json
{
  "version": 3,
  "fetchedAt": "2026-08-05T00:00:00Z",
  "rules": [
    {
      "id": "deny-unauth-admin",
      "match": { "pathTemplate": "/admin/**", "authModes": ["none"] },
      "action": "deny"
    }
  ]
}
```

### Optional Wallarm / OpenAPI path (parallel, later)

Separate from per-request connector blocking:

1. Export inventory → OpenAPI from control plane (already exists).
2. Feed Wallarm API Firewall (or similar) as an **edge** enforcement backend.
3. Keep hosted multi-tenant agent as the discovery + policy distribution brain.

---

## Phased delivery (when Nick opens the epic)

Do **not** start these before marketing-ready discovery is stable ([MARKETING_READY.md](./MARKETING_READY.md)). Protect is a **later epic**, not a soft-launch blocker.

| ID | Name | Ships | Blocked by |
| --- | --- | --- | --- |
| **PM0** | Hooks + contracts | Shared policy JSON schema; connector option stubs (disabled); sample envelope fields `blocked` / `wouldBlock` reserved | Soft-launch stable |
| **PM1** | Shadow mode | Policy pull + local match; allow all; dashboard “would block” counts; no customer-facing deny | PM0 |
| **PM2** | Opt-in block | `mode: 'block'` in connectors; fail-open; per-service enable in UI; audit of denies in dashboard | PM1 + explicit Nick unlock |
| **PM3** | Policy UX | Rule editor (path / auth / signal); versioning; dry-run | PM2 |
| **PM4** | Edge export path | Documented OpenAPI → third-party firewall playbook | OpenAPI export (done) + PM1 optional |

### Parallel agent boundaries (future)

| Stream | Owns | Avoid |
| --- | --- | --- |
| PM0 contracts | `packages/shared` envelope; docs wire protocol | Blocking behavior |
| PM1 agent/policy | `agent/` policy fetch + cache; core policy API read | Connector deny paths |
| PM1–2 connectors | Express / Fastify / FastAPI / Go evaluators | Dashboard redesign |
| PM2–3 dashboard | Service protect settings + shadow/block metrics | Prisma tenancy refactors without coordination |
| PM4 docs | `docs-site` edge playbook only | Inventing Wallarm partnerships |

Discovery path must remain unchanged: samples still aggregate → ingest → inventory.

---

## What not to do

- Remote authorize on every request (latency + availability coupling)
- Fail-closed by default in customer apps
- Store raw bodies to “prove” a block
- Market “prevents breaches” / “blocks attacks” before **PM2** is live and tested
- Bundle protect into the first paid ads wave ([MARKETING_PLAN.md](./MARKETING_PLAN.md))

---

## Status

| Item | State |
| --- | --- |
| Observe / inventory / signals | Shipped |
| OpenAPI export (edge feed input) | Shipped |
| Policy schema / shadow / block | **Not implemented** — roadmap above |
| Marketing claims for protect | **Forbidden** until Nick unlocks after PM1/PM2 |

Related: [DECISIONS.md](./DECISIONS.md) · [PRODUCTIZATION.md](./PRODUCTIZATION.md) · [MARKETING_PLAN.md](./MARKETING_PLAN.md) · [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md)
