# Protect mode (hooks for later)

**v0 is observe-only.** Nothing in the middleware blocks or rewrites responses.

This document sketches how protect mode should plug in later without changing the discovery data path.

## Principles

1. **Discovery stays fully async** — sample flush never waits on policy.
2. **Enforcement is local** — middleware (or sidecar) evaluates a **cached policy** with a ~1–2ms budget.
3. **Fail-open by default** — if policy is missing, stale, or evaluation errors, allow the request.
4. **No per-request remote call** to the control plane for allow/deny.

## Suggested hook points (not implemented)

### Middleware

```js
app.use(apiSensor({
  agentUrl,
  apiKey,
  // Future:
  // protect: {
  //   enabled: false,
  //   mode: 'observe' | 'block',
  //   policyUrl: '...',       // periodic pull
  //   failMode: 'open',       // default
  //   onDeny: (ctx) => res.status(403).json({ error: 'blocked' }),
  // },
}))
```

Before `next()`:

1. Load policy snapshot from memory (refreshed every N seconds from control plane or agent).
2. Match `(method, pathTemplate)` + optional schema/signal rules.
3. If `mode === 'block'` and rule matches → deny; else continue.
4. Still enqueue a sample (including `blocked: true` metadata) asynchronously.

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

### Optional Wallarm / OpenAPI path

Separate from per-request middleware blocking:

1. Export inventory → OpenAPI document from control plane.
2. Feed Wallarm API Firewall (or similar) as an **edge** enforcement backend.
3. Keep Traceable-style agent as the discovery brain.

## What not to do

- Remote authorize on every request (latency + availability coupling)
- Fail-closed by default in customer apps
- Store raw bodies to “prove” a block

## Status

Hooks documented only. No blocking code ships in v0.
