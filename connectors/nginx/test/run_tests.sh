#!/usr/bin/env bash
# Run Lua unit tests for the Nginx connector (no OpenResty required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if ! command -v lua5.1 >/dev/null 2>&1 && ! command -v lua >/dev/null 2>&1; then
  echo "lua5.1 (or lua) required for unit tests" >&2
  exit 1
fi

LUA_BIN="$(command -v lua5.1 || command -v lua)"

# Prefer system lua-cjson when present; otherwise skip golden JSON decode parts gracefully.
export LUA_PATH="${ROOT}/connectors/nginx/?.lua;${LUA_PATH:-;;}"

if ! "$LUA_BIN" -e 'require "cjson.safe"' 2>/dev/null; then
  echo "Installing lua-cjson via luarocks (user tree)…"
  luarocks --local install lua-cjson 2>/dev/null || luarocks --local install lua-cjson2 || true
  eval "$(luarocks --local path)"
fi

"$LUA_BIN" "$ROOT/connectors/nginx/test/redaction_test.lua"
