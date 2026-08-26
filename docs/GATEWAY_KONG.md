# Gateway — Kong

Discover API traffic at the Kong edge with the **API Glimpse Kong Lua plugin**.
Same envelope **v1** as app connectors and the [Nginx / OpenResty](./GATEWAY_NGINX.md) sampler.

Plugin source: [`connectors/kong`](../connectors/kong).  
Decision: [DECISIONS.md](./DECISIONS.md) (SF5 — Nginx / Kong first).

## Requirements

Kong Gateway with Lua plugins enabled (OSS or Enterprise). The plugin uses
`resty.http` (bundled with OpenResty-based Kong images).

## Quick install

1. Put `connectors/kong/kong/plugins/apiglimpse` on Kong’s Lua plugin path
   (`KONG_LUA_PACKAGE_PATH` / `plugins` custom plugin dir — see demo).
2. Set `KONG_PLUGINS=bundled,apiglimpse` (or include `apiglimpse` in your plugins list).
3. Enable the plugin:

```bash
curl -s -X POST http://localhost:8001/plugins \
  --data "name=apiglimpse" \
  --data "config.agent_url=https://collect.apiglimpse.com" \
  --data "config.api_key=ask_YOUR_KEY" \
  --data "config.service_name=kong-gateway"
```

4. Proxy traffic through Kong. Endpoints appear in the dashboard within a few seconds.

## Local demo

```bash
cd demo/kong
docker compose up --build -d
./test.sh
```

## Limits (v1)

| Topic | Behavior |
| --- | --- |
| Fail-open | Collector outages never break client traffic |
| Bodies | Best-effort JSON shapes; metadata always |
| Protect mode | Not enforced in Kong |
| WASM / Envoy | Out of scope |

## Related

- OpenResty Nginx: [GATEWAY_NGINX.md](./GATEWAY_NGINX.md)
- Node sidecar: `@apiglimpse/gateway-proxy`
- Wire protocol: [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md)
