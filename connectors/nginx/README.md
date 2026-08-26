# Nginx / OpenResty gateway connector (SF5)

Sample **access-level** discovery via OpenResty (`ngx_http_lua_module`). Posts
envelope **v1** batches to `collect.apiglimpse.com` like app middleware — without
installing an SDK on every upstream service.

## Requirements

| Runtime | Supported? |
| --- | --- |
| **OpenResty** (recommended) | Yes |
| nginx + [`lua-nginx-module`](https://github.com/openresty/lua-nginx-module) + [`lua-resty-http`](https://github.com/ledgetech/lua-resty-http) | Yes |
| **Stock Nginx without Lua** | **Unsupported** |

Protect mode is **not** enforced at the gateway (use app middleware protect or a WAF).

## Why Nginx / Kong first

Enterprise APIs often sit behind a gateway. Instrumenting the edge discovers
traffic without per-app SDKs. Body shapes are best-effort (JSON only, size-capped
at 64 KiB); method / path / status always ship.

## Env vars

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (e.g. `https://collect.apiglimpse.com`) |
| `API_SENSOR_KEY` | Service API key (`ask_…`) |
| `API_SENSOR_SERVICE_NAME` | Caller label for this gateway (topology edges) |
| `API_SENSOR_SAMPLE_RATE` | Optional `0`–`1` (default `1`) |
| `API_SENSOR_MAX_BODY_BYTES` | Optional JSON body cap (default `65536`) |

Declare env vars Nginx may read:

```nginx
env API_SENSOR_AGENT_URL;
env API_SENSOR_KEY;
env API_SENSOR_SERVICE_NAME;
env API_SENSOR_SAMPLE_RATE;
env API_SENSOR_MAX_BODY_BYTES;
```

## Install (OpenResty)

1. Copy `apiglimpse.lua` and `redaction.lua` onto the server (same directory on `lua_package_path`), **or** install the rockspec later via luarocks.
2. Ensure `lua-resty-http` is available (bundled with many OpenResty images / `opm get ledgetech/lua-resty-http`).
3. Wire the phases:

```nginx
lua_package_path "/etc/nginx/lua/?.lua;;";
lua_need_request_body on;

init_worker_by_lua_block {
  require("apiglimpse").init({
    -- env vars are also read automatically; opts override
    sample_rate = tonumber(os.getenv("API_SENSOR_SAMPLE_RATE") or "1") or 1,
    flush_interval_ms = 1000,
    max_batch = 50,
  })
}

server {
  listen 80;

  location / {
    access_by_lua_block {
      require("apiglimpse").capture_request_body()
    }

    proxy_pass http://upstream;

    body_filter_by_lua_block {
      require("apiglimpse").capture_response_chunk()
    }

    log_by_lua_block {
      require("apiglimpse").log_request()
    }
  }
}
```

4. Reload OpenResty. Traffic appears under the Service tied to `API_SENSOR_KEY`.

Customer guide: [docs/GATEWAY_NGINX.md](../../docs/GATEWAY_NGINX.md).  
Local demo: [demo/nginx-openresty](../../demo/nginx-openresty).

## Behavior

- **Fail-open** — collector errors never fail the client request.
- **Batching** — buffer up to `max_batch` (default 50); flush on timer or full batch.
- **Circuit breaker** — after consecutive 5xx / network failures, pause flushes for `circuit_open_ms` (default 15s). 401 drops the batch without opening the circuit forever.
- **Redaction** — same sensitive headers / `shapeBody` caps as `@apiglimpse/shared` (`redaction.lua`).
- **Bodies** — JSON only, capped; streaming / binary / oversized → metadata-only (`responseBodyCaptured = false`).
- **Caller** — `API_SENSOR_SERVICE_NAME` or `X-Service-Name` / `X-Client-Name` (see [DECISIONS.md](../../docs/DECISIONS.md) SF5).

## Tests

```bash
./connectors/nginx/test/run_tests.sh
```

Integration (Docker): see `demo/nginx-openresty/test.sh`.

## Kong

Kong should reuse this sampler’s contract. See [`../kong/README.md`](../kong/README.md) —
Nginx/OpenResty is the source of truth until the Kong plugin is packaged.
