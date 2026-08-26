# OpenResty gateway demo (C2-NGINX)

Proxies traffic through **OpenResty** with the API Glimpse Lua sampler to a
mock collector (`POST /v1/samples`).

## Prerequisites

- Docker + Docker Compose with a working storage driver (overlay)
- OpenResty image pull access (`openresty/openresty`)

Stock Nginx without Lua is **unsupported** — this demo intentionally uses OpenResty.

If `docker compose build` fails in nested/CI VMs (overlay mount errors), run the
Lua unit tests and mock-collector smoke on the host, and run the full compose
stack on a normal Docker Desktop / Linux host:

```bash
./connectors/nginx/test/run_tests.sh
./demo/nginx-openresty/test-mock-collector.sh
```

## Run

```bash
cd demo/nginx-openresty
docker compose up --build -d
./test.sh
```

| Service | Host port | Role |
| --- | --- | --- |
| `openresty` | `18000` | Gateway + sampler |
| `mock-collector` | `18080` | Records envelope v1 batches |
| `upstream` | (internal) | Echo / HTTP mirror app |

### Manual curls

```bash
curl -sS http://127.0.0.1:18000/healthz
curl -sS -X POST http://127.0.0.1:18000/api/demo \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer secret' \
  -H 'X-Service-Name: demo-client' \
  -d '{"email":"a@b.c","password":"x"}'
sleep 2
curl -sS http://127.0.0.1:18080/_received | jq .
```

Expect `authorization: "[REDACTED]"` and password fields shaped as `[REDACTED]`.

## Env

Compose sets:

```text
API_SENSOR_AGENT_URL=http://mock-collector:8080
API_SENSOR_KEY=ask_demo_nginx
API_SENSOR_SERVICE_NAME=nginx-openresty-demo
API_SENSOR_SAMPLE_RATE=1
```

Point `API_SENSOR_AGENT_URL` at `https://collect.apiglimpse.com` and use a real
`ask_…` key to send samples to hosted API Glimpse instead of the mock.

## Docs

- [docs/GATEWAY_NGINX.md](../../docs/GATEWAY_NGINX.md)
- [connectors/nginx/README.md](../../connectors/nginx/README.md)
