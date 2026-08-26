# Kong gateway plugin — API Glimpse

Kong **Lua** plugin that samples proxied traffic into envelope **v1** and POSTs
batches to `collect.apiglimpse.com` (same contract as the
[Nginx / OpenResty sampler](../nginx/README.md)).

Fail-open: collector errors never fail the client request. Protect mode is
**not** enforced here (use app middleware protect or Kong ACL/OIDC).

## Layout

```
connectors/kong/
  kong/plugins/apiglimpse/
    handler.lua      # log-phase sampler + async flush
    schema.lua       # plugin config
    redaction.lua    # envelope v1 redaction (shared with Nginx)
  README.md
```

## Config

| Field | Env equivalent | Purpose |
| --- | --- | --- |
| `agent_url` | `API_SENSOR_AGENT_URL` | Collector base URL |
| `api_key` | `API_SENSOR_KEY` | Service API key (`ask_…`) |
| `service_name` | `API_SENSOR_SERVICE_NAME` | Caller / topology label |
| `sample_rate` | `API_SENSOR_SAMPLE_RATE` | 0–1 |
| `max_body_bytes` | `API_SENSOR_MAX_BODY_BYTES` | JSON shape cap (default 64 KiB) |

## Enable (Admin API)

After the plugin is on Kong’s `plugins` lua path (see demo):

```bash
curl -s -X POST http://localhost:8001/plugins \
  --data "name=apiglimpse" \
  --data "config.agent_url=https://collect.apiglimpse.com" \
  --data "config.api_key=ask_…" \
  --data "config.service_name=kong-gateway"
```

Or declarative (`kong.yml`):

```yaml
plugins:
  - name: apiglimpse
    config:
      agent_url: https://collect.apiglimpse.com
      api_key: ask_…
      service_name: kong-gateway
      sample_rate: 1
```

## Behavior

1. **`log` phase** — build sample (method, path, status, latency, authObserved, caller, redacted headers; JSON body shapes best-effort).
2. Buffer + periodic / max-batch `POST /v1/samples` with `X-API-Key`.
3. Circuit breaker on 5xx / network failures; 401 drops without permanent open.

Bodies are often unavailable in Kong’s log phase — **metadata always ships**.

## Local demo

```bash
cd demo/kong
docker compose up --build -d
./test.sh
```

## Tests

```bash
./connectors/kong/test/run_tests.sh
```

## Limits (v1)

| Topic | Behavior |
| --- | --- |
| Fail-open | Yes |
| Bodies | Best-effort JSON shape; size-capped |
| Protect | Not enforced in Kong |
| Envoy / WASM | Out of scope |

## Related

- OpenResty: [../nginx/README.md](../nginx/README.md) · [docs/GATEWAY_NGINX.md](../../docs/GATEWAY_NGINX.md)
- Kong customer doc: [docs/GATEWAY_KONG.md](../../docs/GATEWAY_KONG.md)
- Node sidecar: `@apiglimpse/gateway-proxy`
