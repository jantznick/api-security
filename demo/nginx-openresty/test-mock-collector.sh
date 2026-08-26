#!/usr/bin/env bash
# Smoke-test mock collector without Docker/OpenResty.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-18080}"

PORT="$PORT" node "$ROOT/mock-collector/server.js" &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 0.1
  if [[ "$i" -eq 50 ]]; then
    echo "mock collector did not become ready on :${PORT}" >&2
    exit 1
  fi
done

curl -sf -X POST "http://127.0.0.1:${PORT}/_reset" >/dev/null

curl -sf -X POST "http://127.0.0.1:${PORT}/v1/samples" \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: ask_demo_nginx' \
  -d '{"version":1,"apiKey":"ask_demo_nginx","samples":[{"method":"GET","path":"/healthz","statusCode":200,"latencyMs":1,"authObserved":"none","timestamp":"2026-01-15T12:00:00Z","request":{"contentType":null,"headerNames":[],"headers":{},"bodyShape":null},"response":{"contentType":"application/json","headerNames":["content-type"],"headers":{"content-type":"application/json"},"bodyShape":null},"responseBodyCaptured":false}],"sentAt":"2026-01-15T12:00:00Z"}' \
  >/dev/null

PAYLOAD="$(curl -sf "http://127.0.0.1:${PORT}/_received")"
node --input-type=module -e '
const data = JSON.parse(process.argv[1]);
if (data.count !== 1) throw new Error("count");
if (data.envelopes[0].envelope.version !== 1) throw new Error("version");
console.log("ok — mock collector smoke passed");
' "$PAYLOAD"
