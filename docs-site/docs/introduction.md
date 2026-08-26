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
| Express | Available (`npm install @apiglimpse/middleware`) |
| Fastify | Available (`npm install @apiglimpse/fastify`) |
| FastAPI | Available (`pip install apiglimpse`) |
| Go (chi) | Available (`go get …/connectors/go/apiglimpse`) |
| NestJS | Coming soon |
| Next.js (Route Handlers / API routes) | Coming soon |
| Hono | Coming soon |
| Proxy / gateway | Coming soon |

See [Connect your app](/integrating) for install snippets.

## Signup

Create an account on [app.apiglimpse.com](https://app.apiglimpse.com), then create a project and API key.

For Express: `npm install @apiglimpse/middleware`. Other stacks: [Connect your app](/integrating).

## Next

- [Quick start](/quick-start) — account → project → API key → connector
- [Connect your app](/integrating) — Express, Fastify, FastAPI, Go
- [Use cases](/use-cases) — shadow APIs, sensitive fields, OpenAPI export
- [Architecture](/architecture) — how data moves
- [Concepts](/concepts) — API keys, schemas, endpoint limits
