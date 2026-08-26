# Gateway — Nginx / OpenResty

Discover API traffic at the edge with the **API Glimpse OpenResty Lua sampler**.
No per-app SDK install. Same envelope **v1** as Express / Fastify / FastAPI / Go.

Full connector notes: [`connectors/nginx/README.md`](../connectors/nginx/README.md).  
Product decision: [DECISIONS.md](./DECISIONS.md) (SF5 — Nginx / Kong first).

## Requirements

**OpenResty** (or nginx built with `lua-nginx-module` + `lua-resty-http`).

Stock Nginx **without Lua is not supported**.

## Quick install

1. Create a project API key (`ask_…`) in the [dashboard](https://app.apiglimpse.com).
2. Copy `connectors/nginx/apiglimpse.lua` and `redaction.lua` into your Lua package path.
3. Set env vars (and `env …;` directives in `nginx.conf`):

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY_HERE
API_SENSOR_SERVICE_NAME=nginx-gateway
API_SENSOR_SAMPLE_RATE=1
```

4. Initialize in `init_worker_by_lua_block` and sample in `log_by_lua_block` (optionally capture bodies in `access_by_lua` / `body_filter_by_lua`). See the [connector README](../connectors/nginx/README.md) for a full snippet.

5. Reload OpenResty. After a few proxied requests, endpoints appear in the dashboard.

## Local demo

```bash
cd demo/nginx-openresty
docker compose up --build -d
./test.sh
```

Compose runs OpenResty → echo upstream + a mock collector that records `POST /v1/samples`.

## Limits (v1)

| Topic | Behavior |
| --- | --- |
| Fail-open | Collector outages never break client traffic |
| Bodies | JSON shape only, 64 KiB cap; no raw retention |
| Protect mode | Not enforced at the gateway |
| Stock Nginx | Unsupported without Lua |

## Kong / other gateways

Prefer this OpenResty sampler today. Kong packaging tracks the same contract —
see [`connectors/kong/README.md`](../connectors/kong/README.md). For a Node
sidecar instead of Lua, use `@apiglimpse/gateway-proxy`.
