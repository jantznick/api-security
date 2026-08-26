#!/usr/bin/env bash
# Smoke: enable apiglimpse on Kong and hit a proxied route.
set -euo pipefail
cd "$(dirname "$0")"

ADMIN="${ADMIN:-http://127.0.0.1:18003}"
PROXY="${PROXY:-http://127.0.0.1:18002}"
COLLECTOR="${COLLECTOR:-http://127.0.0.1:18081}"

echo "Waiting for Kong admin…"
for i in $(seq 1 60); do
  if curl -sf "$ADMIN" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "$ADMIN" >/dev/null

# Clean slate service/route/plugin (idempotent-ish)
curl -sf -X DELETE "$ADMIN/plugins" >/dev/null 2>&1 || true

SVC=$(curl -sf -X POST "$ADMIN/services" \
  --data "name=echo" \
  --data "url=http://upstream:8080" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

if [[ -z "$SVC" ]]; then
  SVC=$(curl -sf "$ADMIN/services/echo" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
fi

curl -sf -X POST "$ADMIN/services/echo/routes" \
  --data "name=echo-route" \
  --data "paths[]=/" >/dev/null 2>&1 || true

curl -sf -X POST "$ADMIN/plugins" \
  --data "name=apiglimpse" \
  --data "config.agent_url=http://mock-collector:8080" \
  --data "config.api_key=ask_demo_kong" \
  --data "config.service_name=kong-demo" \
  --data "config.sample_rate=1" >/dev/null

echo "Proxy GET /"
curl -sf "$PROXY/" >/dev/null
curl -sf -X POST "$PROXY/api/users" \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"secret"}' >/dev/null || true

echo "Waiting for collector batch…"
ok=0
for i in $(seq 1 30); do
  count=$(curl -sf "$COLLECTOR/_received" | sed -n 's/.*"count":\([0-9]*\).*/\1/p' | head -1)
  if [[ "${count:-0}" -gt 0 ]]; then
    ok=1
    break
  fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  echo "FAIL: mock collector received no batches" >&2
  curl -s "$COLLECTOR/_received" || true
  exit 1
fi

echo "PASS: Kong → API Glimpse samples received ($count batch(es))"
