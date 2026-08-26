# Kong gateway plugin (SF5)

Kong Plugin that samples requests into API Glimpse envelope v1.

## Status

**MVP sketch** — prefer the [Nginx / OpenResty sampler](../nginx/README.md) if you
run OpenResty today. This Kong plugin mirrors the same contract:

- `config.agent_url` → `API_SENSOR_AGENT_URL`
- `config.api_key` → `API_SENSOR_KEY`
- `config.service_name` → `API_SENSOR_SERVICE_NAME` (topology caller label)

## Enable (outline)

```bash
# After packaging as a Kong plugin (luarocks / JS plugin later)
curl -X POST http://localhost:8001/plugins \
  --data "name=apiglimpse" \
  --data "config.agent_url=https://collect.apiglimpse.com" \
  --data "config.api_key=ask_…" \
  --data "config.service_name=kong-gateway"
```

## Behavior

1. `log` phase: build sample (method, path, status, latency, authObserved, caller).
2. Buffer + async POST `/v1/samples` (fail-open).
3. No protect enforcement in Kong MVP — use app middleware protect or Kong ACL/OIDC.

Full Lua/JS plugin source will track `connectors/nginx/apiglimpse.lua` until a
dedicated Kong repo package is published.
