# Kong gateway plugin (SF5)

Kong Plugin that samples requests into API Glimpse envelope v1.

## Status

**Outline only** — the production sampler lives in
[`connectors/nginx/`](../nginx/README.md) (OpenResty). Prefer that path if you
run OpenResty today. This Kong plugin will wrap the **same** contract once
packaged (C2-KONG):

| Kong config | Env / Nginx equivalent |
| --- | --- |
| `config.agent_url` | `API_SENSOR_AGENT_URL` |
| `config.api_key` | `API_SENSOR_KEY` |
| `config.service_name` | `API_SENSOR_SERVICE_NAME` (topology caller label) |
| `config.sample_rate` | `API_SENSOR_SAMPLE_RATE` |

**Source of truth:** [`../nginx/apiglimpse.lua`](../nginx/apiglimpse.lua) +
[`../nginx/redaction.lua`](../nginx/redaction.lua) (envelope v1 redaction parity,
circuit breaker, body size caps). Do not fork sampling logic in Kong until that
module is stable.

## Enable (outline)

```bash
# After packaging as a Kong plugin (luarocks / JS plugin later)
curl -X POST http://localhost:8001/plugins \
  --data "name=apiglimpse" \
  --data "config.agent_url=https://collect.apiglimpse.com" \
  --data "config.api_key=ask_…" \
  --data "config.service_name=kong-gateway"
```

## Behavior (planned)

1. `log` phase: build sample (method, path, status, latency, authObserved, caller).
2. Buffer + async POST `/v1/samples` (fail-open + circuit breaker).
3. No protect enforcement in Kong MVP — use app middleware protect or Kong ACL/OIDC.

Customer gateway docs: [docs/GATEWAY_NGINX.md](../../docs/GATEWAY_NGINX.md).
