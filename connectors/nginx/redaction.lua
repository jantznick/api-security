-- API Glimpse envelope v1 redaction / body shaping (parity with @apiglimpse/shared).
-- Pure Lua — no ngx dependency (unit-testable with stock Lua 5.1+).

local _M = {}

local MAX_STRING = 64
local MAX_HEADER_VAL = 128
local MAX_DEPTH = 4
local MAX_KEYS = 40
local MAX_ARRAY_ITEMS = 5

local SENSITIVE_HEADERS = {
  authorization = true,
  cookie = true,
  ["set-cookie"] = true,
  ["x-api-key"] = true,
  ["x-auth-token"] = true,
  ["proxy-authorization"] = true,
}

function _M.truncate_string(value, max)
  max = max or MAX_STRING
  local s = tostring(value or "")
  if #s <= max then
    return s
  end
  return s:sub(1, max) .. "…"
end

function _M.is_sensitive_header(name)
  return SENSITIVE_HEADERS[string.lower(tostring(name or ""))] == true
end

--- Redact sensitive header values; keys lowercased.
function _M.redact_headers(headers)
  local out = {}
  if type(headers) ~= "table" then
    return out
  end
  for raw_key, raw_val in pairs(headers) do
    local key = string.lower(tostring(raw_key))
    if SENSITIVE_HEADERS[key] then
      out[key] = "[REDACTED]"
    else
      local val
      if type(raw_val) == "table" then
        val = table.concat(raw_val, ", ")
      else
        val = tostring(raw_val or "")
      end
      out[key] = _M.truncate_string(val, MAX_HEADER_VAL)
    end
  end
  return out
end

function _M.redact_value(value)
  if type(value) ~= "string" then
    return value
  end
  if value:match("^[Bb]earer%s+") then
    return "Bearer [REDACTED]"
  end
  if value:match("^eyJ[A-Za-z0-9_-]+%.[A-Za-z0-9_-]+%.[A-Za-z0-9_-]+") then
    return "[REDACTED_JWT]"
  end
  if value:match("%f[%d]%d%d%d%-%d%d%-%d%d%d%d%f[%D]")
    or value:match("^%d%d%d%-%d%d%-%d%d%d%d$")
  then
    return "[REDACTED_SSN]"
  end
  -- Card-like: 13–19 digits with optional spaces/dashes (mirrors shared regex)
  local digit_count = 0
  for _ in value:gmatch("%d") do
    digit_count = digit_count + 1
  end
  if digit_count >= 13 and digit_count <= 19 and value:match("^[%d %-]+$") then
    return "[REDACTED_CARD]"
  end
  return _M.truncate_string(value, MAX_STRING)
end

local function is_secret_key(key)
  local lower = string.lower(tostring(key or ""))
  if lower == "cvv" or lower == "cvc" then
    return true
  end
  return lower:find("password", 1, true)
    or lower:find("secret", 1, true)
    or lower:find("token", 1, true)
    or lower:find("ssn", 1, true)
end

local function is_integer(n)
  return type(n) == "number" and n == math.floor(n) and n == n -- not NaN
end

--- Convert a decoded JSON value into a truncated shape sample.
function _M.shape_body(body, depth)
  depth = depth or 0
  if body == nil then -- cjson.null may be userdata; treat plain nil as null
    return { type = "null" }
  end
  -- cjson.null
  if type(body) == "userdata" then
    return { type = "null" }
  end
  if depth >= MAX_DEPTH then
    return { type = "truncated" }
  end

  local t = type(body)
  if t == "string" then
    return { type = "string", sample = _M.redact_value(body) }
  end
  if t == "number" then
    if is_integer(body) then
      return { type = "integer", sample = body }
    end
    return { type = "number", sample = body }
  end
  if t == "boolean" then
    return { type = "boolean", sample = body }
  end
  if t == "table" then
    -- Array if consecutive integer keys from 1..n
    local n = #body
    local is_array = n > 0
    if is_array then
      for i = 1, n do
        if body[i] == nil then
          is_array = false
          break
        end
      end
    end
    -- empty table: treat as object (matches JS empty object more often than empty array)
    if is_array then
      local limit = math.min(n, MAX_ARRAY_ITEMS)
      local items = {}
      for i = 1, limit do
        items[i] = _M.shape_body(body[i], depth + 1)
      end
      return {
        type = "array",
        length = n,
        items = items,
      }
    end

    local keys = {}
    for k in pairs(body) do
      if type(k) == "string" then
        keys[#keys + 1] = k
      end
    end
    table.sort(keys)
    local truncated = #keys > MAX_KEYS
    local properties = {}
    local limit = math.min(#keys, MAX_KEYS)
    for i = 1, limit do
      local key = keys[i]
      if is_secret_key(key) then
        properties[key] = { type = "string", sample = "[REDACTED]" }
      else
        properties[key] = _M.shape_body(body[key], depth + 1)
      end
    end
    return {
      type = "object",
      properties = properties,
      truncatedKeys = truncated,
    }
  end

  return { type = "unknown" }
end

function _M.header_names(headers)
  local names = {}
  if type(headers) ~= "table" then
    return names
  end
  for raw_key in pairs(headers) do
    names[#names + 1] = string.lower(tostring(raw_key))
  end
  table.sort(names)
  return names
end

function _M.content_type_base(ct)
  if not ct or ct == "" then
    return nil
  end
  local s = tostring(ct)
  local semi = s:find(";", 1, true)
  if semi then
    s = s:sub(1, semi - 1)
  end
  return (s:match("^%s*(.-)%s*$")) or s
end

function _M.observe_auth(headers)
  if type(headers) ~= "table" then
    return "none"
  end
  local authorization = headers["authorization"] or headers["Authorization"]
  if authorization and tostring(authorization):match("^[Bb]earer%s+") then
    return "bearer"
  end
  if headers["cookie"] or headers["Cookie"] then
    return "cookie"
  end
  return "none"
end

function _M.classify_user_agent(ua)
  local s = string.lower(tostring(ua or ""))
  if s == "" then
    return "unknown"
  end
  if s:find("curl/", 1, true) or s == "curl" then
    return "curl"
  end
  if s:find("mozilla/", 1, true)
    or s:find("chrome/", 1, true)
    or s:find("safari/", 1, true)
    or s:find("firefox/", 1, true)
    or s:find("edg/", 1, true)
  then
    return "browser"
  end
  if s:find("axios", 1, true)
    or s:find("node-fetch", 1, true)
    or s:find("go-http", 1, true)
    or s:find("python-requests", 1, true)
    or s:find("okhttp", 1, true)
    or s:find("java/", 1, true)
    or s:find("apiglimpse", 1, true)
  then
    return "sdk"
  end
  return "unknown"
end

--- Resolve caller identity (mirrors @apiglimpse/shared resolveCallerHints).
function _M.resolve_caller(headers, service_name)
  local h = headers or {}
  local explicit = tostring(
    h["x-service-name"]
      or h["X-Service-Name"]
      or h["x-client-name"]
      or h["X-Client-Name"]
      or service_name
      or ""
  ):match("^%s*(.-)%s*$")
  if explicit == "" then
    explicit = nil
  end
  local ua = h["user-agent"] or h["User-Agent"] or ""
  local ua_family = _M.classify_user_agent(ua)
  if explicit then
    return {
      key = "svc:" .. string.lower(explicit),
      label = explicit,
      serviceName = explicit,
      userAgentFamily = ua_family,
    }
  end
  return {
    key = "ua:" .. ua_family,
    label = "ua:" .. ua_family,
    serviceName = nil,
    userAgentFamily = ua_family,
  }
end

_M.MAX_STRING = MAX_STRING
_M.MAX_HEADER_VAL = MAX_HEADER_VAL
_M.MAX_DEPTH = MAX_DEPTH
_M.MAX_KEYS = MAX_KEYS
_M.MAX_ARRAY_ITEMS = MAX_ARRAY_ITEMS
_M.SENSITIVE_HEADERS = SENSITIVE_HEADERS

return _M
