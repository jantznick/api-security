# @apiglimpse/middleware

What app developers install. Express middleware that sends API traffic metadata to API Glimpse (`collect.apiglimpse.com`). This is the public SDK.

It samples requests/responses, redacts secrets, and flushes async batches so endpoints, schemas, and signals show up in your dashboard. Sampling never blocks your app: if the collector is down, samples are dropped and Express keeps serving traffic.

## Install

```bash
npm install @apiglimpse/middleware
```

## Quick start

```js
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();
app.use(express.json());

app.use(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
    apiKey: process.env.API_SENSOR_KEY,
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
    // Optional SF7 protect (opt-in; fail-open). See docs/PROTECT_MODE.md
    // protect: { enabled: true, mode: 'observe', policyUrl: '...' },
  }),
);
```

### Protect (optional)

```js
protect: {
  enabled: true,
  mode: 'observe', // or 'block' — never fail-closed by default
  failMode: 'open',
  policy: { version: 1, rules: [/* deny rules */] },
  // policyUrl: 'https://.../api/services/<id>/protect/policy',
}
```

In `observe` mode, matching requests are allowed and samples may include `wouldBlock: true`. In `block` mode, matching requests get 403 (or `onDeny`) while discovery still samples asynchronously.

Environment:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
```

Full customer guide: [docs/INTEGRATING.md](../../docs/INTEGRATING.md) · public docs: [docs.apiglimpse.com](https://docs.apiglimpse.com).
Protect roadmap: [docs/PROTECT_MODE.md](../../docs/PROTECT_MODE.md).

## Dependency note

In this monorepo, `package.json` uses `"@apiglimpse/shared": "file:../shared"` for local development. Publishing uses `scripts/publish.mjs`, which temporarily points at the registry version (`^0.1.0`), publishes, then restores `file:../shared`.

## Maintainer publish

Publish `@apiglimpse/shared` first, then:

```bash
cd packages/middleware
npm run publish:npm
```

First-time npm account, org, and step-by-step: [docs/NPM_PUBLISH.md](../../docs/NPM_PUBLISH.md).
