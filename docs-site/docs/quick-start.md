# Quick start

Get endpoints showing in your project in a few minutes.

This walkthrough uses the **Express** connector. Other connectors are listed on [Connect your app](/integrating#connectors).

## 1. Create an account

1. Open the dashboard: [app.apiglimpse.com](https://app.apiglimpse.com)
2. Sign up
3. Create a **project**
4. Create an API key and copy it (`ask_…`). It is shown once when you create it.

## 2. Install the connector (example: Express)

```bash
npm install @apiglimpse/middleware
```

## 3. Set environment variables

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY_HERE
API_SENSOR_SAMPLE_RATE=1
```

## 4. Mount the middleware

```js
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();
app.use(express.json());

app.use(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
    apiKey: process.env.API_SENSOR_KEY || '',
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
  }),
);
```

Mount **after** body parsers you care about, and early enough to cover the routes you want to see.

## 5. Check the dashboard

1. Hit a few of your routes
2. Open the dashboard → your project → endpoints (method + path within a few seconds)
3. Optional: `curl -s $API_SENSOR_AGENT_URL/health` to confirm API Glimpse is reachable

Full options and CommonJS notes: [Connect your app — Express](/integrating#express).
