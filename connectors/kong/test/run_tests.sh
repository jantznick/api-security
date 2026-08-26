#!/usr/bin/env bash
# Redaction unit tests for Kong plugin (no Kong required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

LUA_BIN="$(command -v lua5.1 || command -v lua || true)"
if [[ -z "${LUA_BIN}" ]]; then
  echo "lua5.1 (or lua) required" >&2
  exit 1
fi

export LUA_PATH="${ROOT}/connectors/kong/kong/plugins/apiglimpse/?.lua;${LUA_PATH:-;;}"

if ! "$LUA_BIN" -e 'require "cjson.safe"' 2>/dev/null; then
  echo "lua-cjson recommended; continuing (some asserts may skip)"
  luarocks --local install lua-cjson 2>/dev/null || true
  eval "$(luarocks --local path 2>/dev/null || true)"
fi

"$LUA_BIN" -e '
package.path = os.getenv("LUA_PATH") or package.path
local redaction = require "redaction"
assert(redaction.redact_headers({ Authorization = "Bearer secret" })["authorization"] == "[REDACTED]")
local shaped = redaction.shape_body({ password = "x", email = "a@b.com" }, 0)
assert(shaped.type == "object")
assert(shaped.properties.password.sample == "[REDACTED]")
print("kong redaction ok")
'
