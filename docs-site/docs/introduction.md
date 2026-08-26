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
| NestJS | Available (`npm install @apiglimpse/nestjs`) |
| Next.js | Available (`npm install @apiglimpse/next`) |
| FastAPI / Django / Flask | Available (`pip install apiglimpse`) |
| Go (chi) | Available (`go get …/connectors/go/apiglimpse`) |
| Spring Boot | Available (Maven starter) |
| ASP.NET Core | Available (`ApiGlimpse.AspNetCore`) |
| Nginx (OpenResty) / Kong | Available (Lua plugins) |
| Node gateway sidecar | Available (`@apiglimpse/gateway-proxy`) |
| Hono | Coming soon |

See [Connect your app](/integrating) for install snippets.

## Signup

Create an account on [app.apiglimpse.com](https://app.apiglimpse.com), then create a project and API key.

For Express: `npm install @apiglimpse/middleware`. Other stacks: [Connect your app](/integrating).

## Next

- [Quick start](/quick-start) — account → project → API key → connector
- [Connect your app](/integrating) — Express, Nest, Next, Python, Java, .NET, gateways
- [Use cases](/use-cases) — shadow APIs, sensitive fields, OpenAPI export
- [Architecture](/architecture) — how data moves
- [Concepts](/concepts) — API keys, schemas, endpoint limits
