# Nginx gateway connector (SF5)

Sample **access-level** discovery via `ngx_http_lua_module` (OpenResty) or
[`nginx-module-lua`](https://github.com/openresty/lua-nginx-module). Posts
envelope v1 batches to `collect.apiglimpse.com` like app middleware.

## Why Nginx / Kong first

Enterprise APIs often sit behind a gateway. Instrumenting the edge discovers
traffic **without** installing SDKs on every service. Body shapes are best-effort
(JSON only, size-capped); method/path/status always ship.

## Env vars

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (e.g. `https://collect.apiglimpse.com`) |
| `API_SENSOR_KEY` | Service API key (`ask_…`) |
| `API_SENSOR_SERVICE_NAME` | Optional label for this gateway as a caller upstream |

## Install (OpenResty sketch)

1. Copy `apiglimpse.lua` into your lua package path.
2. In `http {}` or `server {}`:

```nginx
init_worker_by_lua_block {
  require("apiglimpse").init({
    agent_url = os.getenv("API_SENSOR_AGENT_URL") or "http://127.0.0.1:8080",
    api_key = os.getenv("API_SENSOR_KEY") or "",
    service_name = os.getenv("API_SENSOR_SERVICE_NAME") or "nginx-gateway",
    sample_rate = 1.0,
    flush_interval_ms = 1000,
  })
}

log_by_lua_block {
  require("apiglimpse").log_request()
}
```

3. Reload Nginx. Traffic should appear under the Service tied to `API_SENSOR_KEY`.

## Limits

- Fail-open: collector errors never fail the client request.
- No raw body retention — short JSON samples shaped then discarded.
- Streaming / binary responses are metadata-only.
- Protect mode is **not** enforced in this Lua MVP (use app middleware protect or WAF).

## Kong

See [`../kong/README.md`](../kong/README.md) for the Kong plugin wrapper that
reuses the same sampling ideas.
