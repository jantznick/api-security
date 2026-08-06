# Architecture

API Glimpse finds endpoints from real traffic. A connector in your app sends samples to API Glimpse. You browse endpoints and schemas in the dashboard.

## Data flow

```
Your app
  → Connector (samples + API key)
  → API Glimpse (validate key, aggregate per project)
  → Store (schemas + tags)
  → Dashboard (session auth)
```

| Piece | Role |
| --- | --- |
| **Connector** | Samples requests in your app; sends batches in the background. Express is available now; more connectors are coming. |
| **API Glimpse** (`collect.apiglimpse.com`) | Accepts batches with your project API key; aggregates per project |
| **API and store** | Saves endpoints, schemas, and tags; serves the dashboard and project APIs |
| **Dashboard** (`app.apiglimpse.com`) | Projects, API keys, endpoints, endpoint detail |

Your app talks to the `collect` URL. Reading endpoints and managing keys goes through the dashboard (session auth).

## Components

### Connector

Captures method, path, status, latency, header names, and truncated body field names/types. Removes secrets. Buffers and sends asynchronously so sampling stays off the critical request path. If API Glimpse is unreachable, samples are dropped and your app keeps serving traffic.

See [Connectors](/integrating#connectors) for what is available now and what is coming soon.

### Receiving samples

1. Require a project API key on each batch
2. Validate the key and map it to a project
3. Invalid or missing key → reject the batch (no endpoint update)
4. Rate limit and body size caps
5. Aggregate samples per project, then update endpoints

Samples are used briefly for aggregation. Long-lived storage is schemas, counters, and tags — not raw bodies.

### Dashboard and projects

Session auth for humans. Create projects, create API keys, and browse endpoints: methods, path templates, merged schemas, and tags.

## Projects

Every endpoint row is scoped to a `projectId`. Your API key identifies the project; batches from different projects are kept separate.

## Hosting

| Piece | Host |
| --- | --- |
| Collect | `collect.apiglimpse.com` |
| Dashboard | `app.apiglimpse.com` |
| Docs | `docs.apiglimpse.com` |
| Marketing | `apiglimpse.com` |

## Customer config

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_xxx
```

## Endpoint limits

Projects may enforce an **endpoint limit**: new endpoints over the cap are skipped; existing endpoints continue to update. See [Concepts](/concepts).
