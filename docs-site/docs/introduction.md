# Introduction

**API Glimpse** shows you the endpoints your API actually serves, plus schemas and field types, from real traffic.

Add a connector, set your API key and API Glimpse URL, then open the dashboard.

```
Your app
  → Connector (e.g. @apiglimpse/middleware for Express)
  → API Glimpse
  → Dashboard (endpoints, schemas, tags)
```

## Connectors

| Connector | Status |
| --- | --- |
| Express | Available now |
| Fastify | Coming soon |
| NestJS | Coming soon |
| Next.js (Route Handlers / API routes) | Coming soon |
| Hono | Coming soon |
| FastAPI | Coming soon |
| Go (chi) | Coming soon |
| Proxy / gateway | Coming soon |

Install guides use **Express** as the worked example today.

## Signup

Create an account on [app.apiglimpse.com](https://app.apiglimpse.com), then create a project and API key.

For Express: `npm install @apiglimpse/middleware`.

## Next

- [Quick start](/quick-start) — account → project → API key → connector
- [Connect your app](/integrating) — Express connector guide
- [Architecture](/architecture) — how data moves
- [Concepts](/concepts) — API keys, schemas, endpoint limits
