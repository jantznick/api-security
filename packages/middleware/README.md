# @apiglimpse/middleware

Express middleware for API Glimpse. Captures request/response shapes, redacts secrets, and flushes async batches to API Glimpse cloud so endpoints, schemas, and signals appear in your dashboard.

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
  }),
);
```

Environment:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
```

If the collector is unreachable, samples are dropped and your Express app continues to serve traffic normally.

Full guide: [docs/INTEGRATING.md](../../docs/INTEGRATING.md) · public docs: [docs.apiglimpse.com](https://docs.apiglimpse.com).

## Publish (maintainers)

Publish `@apiglimpse/shared` first, then this package. Before publish, change the local `file:../shared` dependency to `"@apiglimpse/shared": "^0.1.0"`. Full steps: [docs/INTEGRATING.md](../../docs/INTEGRATING.md#npm-publish-maintainers).
