# @apiglimpse/next

Next.js **App Router** helpers that send API traffic metadata to API Glimpse (`collect.apiglimpse.com`).

Wrap Route Handlers (preferred) so samples include method, path, status, latency, headers, and JSON body shapes. Sampling is **fail-open**: if the collector is down, samples are dropped and your handlers keep serving traffic.

## Install

```bash
npm install @apiglimpse/next
```

## Quick start (Route Handlers)

```js
// app/api/users/route.js
import { withApiSensor } from '@apiglimpse/next';

export const GET = withApiSensor(async () => {
  return Response.json({ users: [] });
});

export const POST = withApiSensor(async (request) => {
  // Safe: the wrapper clones the Request before your handler runs,
  // so request.json() still works here (single-consume body).
  const body = await request.json();
  return Response.json({ ok: true, echo: body }, { status: 201 });
});
```

Or share one sensor instance:

```js
import { createApiSensor } from '@apiglimpse/next';

const sensor = createApiSensor({
  agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
  apiKey: process.env.API_SENSOR_KEY,
  sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
});

export const GET = sensor.wrap(async () => Response.json({ ok: true }));
```

Environment (also read as defaults):

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
API_SENSOR_SAMPLE_RATE=1
```

## Optional: Next.js middleware

Middleware is **metadata-first**. Prefer Route Handler `wrap` / `withApiSensor` when you need response JSON shapes.

```js
// middleware.js
import { NextResponse } from 'next/server';
import { withApiSensorMiddleware } from '@apiglimpse/next';

export const middleware = withApiSensorMiddleware((request) => {
  return NextResponse.next();
});

export const config = {
  matcher: '/api/:path*',
};
```

## Limitations (read this)

Next.js App Router is a quirk surface. This package documents the constraints instead of fighting them with global monkey-patches.

### `request.json()` is single-consume

A `Request` body stream can be read **once**. The wrapper **clones** the request *before* calling your handler so it can shape JSON for sampling while your handler still calls `request.json()` / `request.text()`.

- Do not call `request.json()` in middleware *and* again in the route without cloning yourself.
- If you set `captureRequestBody: false`, the sensor will not clone; pass a body into `sensor.record(...)` yourself if needed.

### Response streaming

If your handler returns a streaming body (`ReadableStream`, SSE, large transfers), response JSON capture is skipped (fail-open). Status, path, latency, and headers are still sampled when possible.

Capture uses `response.clone()` + `text()` with a **64 KiB** cap. Oversized or non-JSON bodies are not shaped (`responseBodyCaptured: false`).

### Edge runtime

- Timers (`setInterval`) and Node `Buffer` may be limited or absent. The sensor flushes after each wrapped request and uses `TextEncoder` when `Buffer` is missing.
- In middleware, pass the `NextFetchEvent` so `event.waitUntil(flush)` can keep the isolate alive for the POST.
- Prefer the **Node.js** runtime for Route Handlers when you want the same buffering behavior as Express/Fastify:

  ```js
  export const runtime = 'nodejs';
  ```

### Pages Router

Not a primary target. You can call `createApiSensor().record(request, response)` from a Pages API route, but App Router wrap helpers are the supported path.

## Behavioral contract

Matches other API Glimpse connectors:

1. Fail-open — never fail the customer response because of sampling
2. Async buffer + flush + circuit breaker on collector failures
3. `POST {agentUrl}/v1/samples` with `X-API-Key` and envelope **v1** (`createSample` / `createEnvelope` from `@apiglimpse/shared`)

Full customer guide: [docs/INTEGRATING.md](../../docs/INTEGRATING.md) · wire format: [docs/WIRE_PROTOCOL.md](../../docs/WIRE_PROTOCOL.md).

## Dependency note

In this monorepo, `package.json` uses `"@apiglimpse/shared": "file:../shared"` for local development. Publishing uses `scripts/publish.mjs`, which temporarily points at the registry version, publishes, then restores `file:../shared`.

## Maintainer publish

Publish `@apiglimpse/shared` first, then:

```bash
cd packages/next
npm run publish:npm
```
