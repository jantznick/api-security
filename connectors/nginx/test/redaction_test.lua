#!/usr/bin/env lua5.1
-- Unit tests for connectors/nginx/redaction.lua (no ngx required).
-- Run: ./connectors/nginx/test/run_tests.sh

package.path = arg[0]:gsub("redaction_test%.lua$", "../?.lua;") .. package.path

local redaction = require "redaction"
local cjson = require "cjson.safe"

local failures = 0

local function assert_eq(actual, expected, msg)
  if actual ~= expected then
    failures = failures + 1
    io.stderr:write(string.format(
      "FAIL %s: expected %q got %q\n",
      msg or "assert_eq",
      tostring(expected),
      tostring(actual)
    ))
  end
end

local function assert_true(cond, msg)
  if not cond then
    failures = failures + 1
    io.stderr:write("FAIL " .. (msg or "assert_true") .. "\n")
  end
end

-- truncate
assert_eq(redaction.truncate_string("abc", 10), "abc", "truncate short")
assert_eq(redaction.truncate_string(string.rep("x", 70), 64), string.rep("x", 64) .. "…", "truncate long")

-- headers
local rh = redaction.redact_headers({
  Authorization = "Bearer secret",
  ["Content-Type"] = "application/json",
  Cookie = "sid=1",
  ["X-Request-Id"] = "req-abc-123",
})
assert_eq(rh["authorization"], "[REDACTED]", "auth redacted")
assert_eq(rh["cookie"], "[REDACTED]", "cookie redacted")
assert_eq(rh["content-type"], "application/json", "ct kept")
assert_eq(rh["x-request-id"], "req-abc-123", "xid kept")

-- values
assert_eq(redaction.redact_value("Bearer abc"), "Bearer [REDACTED]", "bearer")
assert_eq(redaction.redact_value("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb"), "[REDACTED_JWT]", "jwt")
assert_eq(redaction.redact_value("123-45-6789"), "[REDACTED_SSN]", "ssn")
assert_eq(redaction.redact_value("4111111111111111"), "[REDACTED_CARD]", "card")

-- auth observe
assert_eq(redaction.observe_auth({ authorization = "Bearer x" }), "bearer", "auth bearer")
assert_eq(redaction.observe_auth({ cookie = "a=b" }), "cookie", "auth cookie")
assert_eq(redaction.observe_auth({}), "none", "auth none")

-- caller
local c1 = redaction.resolve_caller({ ["user-agent"] = "curl/8.0" }, "nginx-gateway")
assert_eq(c1.key, "svc:nginx-gateway", "caller svc key")
assert_eq(c1.userAgentFamily, "curl", "caller ua curl")
local c2 = redaction.resolve_caller({ ["user-agent"] = "curl/8.0", ["x-service-name"] = "payments" }, nil)
assert_eq(c2.key, "svc:payments", "caller x-service-name")

-- shape body (parity with sample-shaped.json structure)
local shaped = redaction.shape_body({
  email = "user@example.com",
  password = "secret",
  profile = { name = "Ada", age = 36 },
})
assert_eq(shaped.type, "object", "shape object")
assert_eq(shaped.properties.password.sample, "[REDACTED]", "password redacted")
assert_eq(shaped.properties.email.sample, "user@example.com", "email sample")
assert_eq(shaped.properties.profile.properties.age.type, "integer", "age integer")
assert_eq(shaped.truncatedKeys, false, "not truncated")

-- golden fixture request bodyShape from packages/shared
local fixture_path = arg[0]:gsub("connectors/nginx/test/redaction_test%.lua$", "packages/shared/fixtures/sample-shaped.json")
local f = io.open(fixture_path, "r")
if f then
  local raw = f:read("*a")
  f:close()
  local fixture = cjson.decode(raw)
  local req_shape = redaction.shape_body({
    email = "user@example.com",
    password = "hunter2",
    profile = { name = "Ada", age = 36 },
  })
  assert_eq(req_shape.properties.email.type, fixture.request.bodyShape.properties.email.type, "fixture email type")
  assert_eq(req_shape.properties.password.sample, fixture.request.bodyShape.properties.password.sample, "fixture password")
  assert_eq(req_shape.properties.profile.properties.name.sample, fixture.request.bodyShape.properties.profile.properties.name.sample, "fixture name")
else
  io.stderr:write("WARN: fixture not found at " .. fixture_path .. " (skipped golden compare)\n")
end

if failures > 0 then
  io.stderr:write(string.format("%d failure(s)\n", failures))
  os.exit(1)
end

print("ok — redaction.lua unit tests passed")
