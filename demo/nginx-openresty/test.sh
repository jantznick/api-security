#!/usr/bin/env bash
# Integration test: curl through OpenResty → assert mock collector received envelope v1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:18000}"
COLLECTOR_URL="${COLLECTOR_URL:-http://127.0.0.1:18080}"
COMPOSE="${COMPOSE:-docker compose}"

if ! command -v docker >/dev/null 2>&1; then
  cat <<'EOF' >&2
Docker is required for the OpenResty integration demo.

Manual checklist (any host with Docker):
  1. cd demo/nginx-openresty && docker compose up --build -d
  2. curl -sS http://127.0.0.1:18000/healthz
  3. curl -sS -X POST http://127.0.0.1:18000/api/users \
       -H 'Content-Type: application/json' \
       -H 'Authorization: Bearer secret-token' \
       -H 'X-Service-Name: demo-client' \
       -d '{"email":"a@b.c","password":"x"}'
  4. sleep 2
  5. curl -sS http://127.0.0.1:18080/_received | jq .
     Expect version=1 samples with redacted authorization and password shape.
EOF
  exit 1
fi

echo "==> Starting compose stack"
$COMPOSE up --build -d

echo "==> Waiting for gateway"
for i in $(seq 1 60); do
  if curl -sf "$GATEWAY_URL/healthz" >/dev/null; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "Gateway did not become ready" >&2
    $COMPOSE logs --no-color >&2 || true
    exit 1
  fi
done

echo "==> Reset mock collector"
curl -sf -X POST "$COLLECTOR_URL/_reset" >/dev/null

echo "==> Drive traffic through OpenResty"
curl -sf "$GATEWAY_URL/healthz" >/dev/null
curl -sf -X POST "$GATEWAY_URL/api/users" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer secret-token' \
  -H 'X-Service-Name: demo-client' \
  -H 'X-Request-Id: nginx-demo-1' \
  -d '{"email":"user@example.com","password":"hunter2","profile":{"name":"Ada","age":36}}' \
  >/dev/null

echo "==> Wait for Lua flush timer"
sleep 2

echo "==> Assert collector received samples"
PAYLOAD="$(curl -sf "$COLLECTOR_URL/_received")"
node --input-type=module -e "
const data = JSON.parse(process.argv[1]);
if (!data.count || data.count < 1) {
  console.error('expected at least one envelope, got', data);
  process.exit(1);
}
const env = data.envelopes[0].envelope;
if (env.version !== 1) throw new Error('version');
if (!Array.isArray(env.samples) || env.samples.length < 1) throw new Error('samples');
const sample = env.samples.find((s) => s.path === '/api/users') || env.samples[0];
if (sample.request?.headers?.authorization !== '[REDACTED]') {
  throw new Error('authorization not redacted: ' + JSON.stringify(sample.request?.headers));
}
if (sample.authObserved !== 'bearer') throw new Error('authObserved');
if (sample.caller?.key !== 'svc:demo-client' && sample.caller?.key !== 'svc:nginx-openresty-demo') {
  // X-Service-Name should win
  if (sample.caller?.key !== 'svc:demo-client') {
    throw new Error('caller key: ' + sample.caller?.key);
  }
}
console.log('ok — received', data.count, 'envelope(s), sample path=', sample.path, 'status=', sample.statusCode);
" "$PAYLOAD"

echo "==> Integration test passed"
