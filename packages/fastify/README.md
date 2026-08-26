# @apiglimpse/fastify

What app developers install for Fastify. Plugin that sends API traffic metadata to API Glimpse (`collect.apiglimpse.com`). This is the public SDK for Fastify apps.

It samples requests/responses, redacts secrets, and flushes async batches so endpoints, schemas, and signals show up in your dashboard. Sampling never blocks your app: if the collector is down, samples are dropped and Fastify keeps serving traffic.

## Install

```bash
npm install @apiglimpse/fastify
```

## Quick start

```js
import Fastify from 'fastify';
import { apiSensor } from '@apiglimpse/fastify';

const app = Fastify();

await app.register(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
    apiKey: process.env.API_SENSOR_KEY,
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
  }),
);
```

Environment (optional — also read as defaults by the plugin):

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
API_SENSOR_SAMPLE_RATE=1
```

Full customer guide: [docs/INTEGRATING.md](../../docs/INTEGRATING.md) · public docs: [docs.apiglimpse.com](https://docs.apiglimpse.com).

## Dependency note

In this monorepo, `package.json` uses `"@apiglimpse/shared": "file:../shared"` for local development. Publishing uses `scripts/publish.mjs`, which temporarily points at the registry version (`^0.1.0`), publishes, then restores `file:../shared`.

## Maintainer publish

Publish `@apiglimpse/shared` first, then:

```bash
cd packages/fastify
npm run publish:npm
```

First-time npm account, org, and step-by-step: [docs/NPM_PUBLISH.md](../../docs/NPM_PUBLISH.md).
