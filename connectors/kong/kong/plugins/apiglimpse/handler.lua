-- Kong plugin: API Glimpse sampler (envelope v1).
-- Fail-open: never fail the proxied request on collector errors.
-- Prefer OpenResty Nginx sampler for non-Kong edges — see connectors/nginx.

local cjson = require "cjson.safe"
local redaction = require "kong.plugins.apiglimpse.redaction"

local ApiglimpseHandler = {
  PRIORITY = 10,
  VERSION = "0.1.0",
}

-- Shared worker state (one plugin config typically).
local state = {
  conf = nil,
  buffer = {},
  flushing = false,
  consecutive_failures = 0,
  circuit_open_until = 0,
  timer_started = false,
}

local function now_ms()
  return (ngx.now and ngx.now() or os.time()) * 1000
end

local function iso_utc()
  return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

local function should_sample(rate)
  rate = tonumber(rate) or 1
  if rate >= 1 then
    return true
  end
  if rate <= 0 then
    return false
  end
  return math.random() < rate
end

local function circuit_open()
  return now_ms() < state.circuit_open_until
end

local function record_failure(conf)
  state.consecutive_failures = state.consecutive_failures + 1
  local threshold = conf.circuit_failure_threshold or 3
  if state.consecutive_failures >= threshold then
    state.circuit_open_until = now_ms() + (conf.circuit_open_ms or 15000)
    state.consecutive_failures = 0
    kong.log.warn("[apiglimpse] circuit open")
  end
end

local function record_success()
  state.consecutive_failures = 0
  state.circuit_open_until = 0
end

local function flatten_headers(h)
  if type(h) ~= "table" then
    return {}
  end
  local out = {}
  for k, v in pairs(h) do
    if type(v) == "table" then
      out[k] = table.concat(v, ", ")
    else
      out[k] = tostring(v)
    end
  end
  return out
end

local function build_side(headers, body_shape, content_type_hint)
  local flat = flatten_headers(headers)
  local ct = redaction.content_type_base(
    content_type_hint or flat["content-type"] or flat["Content-Type"]
  )
  return {
    contentType = ct,
    headerNames = redaction.header_names(flat),
    headers = redaction.redact_headers(flat),
    bodyShape = body_shape,
  }
end

local function try_parse_json_body(raw, content_type, max_bytes)
  if not raw or raw == "" then
    return nil
  end
  if #raw > max_bytes then
    return nil
  end
  local ct = string.lower(tostring(content_type or ""))
  local looks_json = ct:find("json", 1, true) or ct:find("javascript", 1, true)
  if not looks_json then
    local first = raw:sub(1, 1)
    if first ~= "{" and first ~= "[" then
      return nil
    end
  end
  return cjson.decode(raw)
end

local function observe_auth(headers)
  local auth = headers["authorization"] or headers["Authorization"]
  if auth and tostring(auth):match("^[Bb]earer%s+") then
    return "bearer"
  end
  if headers["cookie"] or headers["Cookie"] then
    return "cookie"
  end
  return "none"
end

local function flush(premature)
  if premature then
    return
  end
  local conf = state.conf
  if not conf or state.flushing or #state.buffer == 0 then
    return
  end
  if circuit_open() then
    return
  end

  state.flushing = true
  local batch = {}
  local n = math.min(#state.buffer, conf.max_batch or 50)
  for i = 1, n do
    batch[i] = table.remove(state.buffer, 1)
  end

  local ok_all, err_all = pcall(function()
    local ok_http, http = pcall(require, "resty.http")
    if not ok_http or not http then
      kong.log.warn("[apiglimpse] resty.http missing")
      record_failure(conf)
      return
    end

    local httpc = http.new()
    httpc:set_timeout(conf.request_timeout_ms or 2000)

    local url = tostring(conf.agent_url or ""):gsub("/$", "") .. "/v1/samples"
    local body = cjson.encode({
      version = 1,
      apiKey = conf.api_key,
      samples = batch,
      sentAt = iso_utc(),
    })

    local res, err = httpc:request_uri(url, {
      method = "POST",
      headers = {
        ["Content-Type"] = "application/json",
        ["X-API-Key"] = conf.api_key or "",
      },
      body = body,
    })

    if not res then
      kong.log.warn("[apiglimpse] flush failed: ", err)
      record_failure(conf)
      return
    end

    local status = tonumber(res.status) or 0
    if status >= 500 then
      record_failure(conf)
    elseif status == 401 then
      kong.log.warn("[apiglimpse] collector rejected API key (401)")
    else
      record_success()
    end
  end)

  state.flushing = false
  if not ok_all then
    kong.log.warn("[apiglimpse] flush error: ", err_all)
    record_failure(conf)
  end
end

local function ensure_timer(conf)
  if state.timer_started then
    return
  end
  state.timer_started = true
  local interval = math.max(0.2, (conf.flush_interval_ms or 1000) / 1000)
  local handler
  handler = function(premature)
    if premature then
      return
    end
    flush(false)
    local ok, err = ngx.timer.at(interval, handler)
    if not ok then
      kong.log.warn("[apiglimpse] timer reschedule failed: ", err)
      state.timer_started = false
    end
  end
  local ok, err = ngx.timer.at(interval, handler)
  if not ok then
    kong.log.warn("[apiglimpse] timer start failed: ", err)
    state.timer_started = false
  end
end

function ApiglimpseHandler:init_worker()
  -- Config arrives per-request; timer starts on first log with conf.
end

function ApiglimpseHandler:log(conf)
  local ok, err = pcall(function()
    state.conf = conf
    ensure_timer(conf)

    if not should_sample(conf.sample_rate) then
      return
    end

    local max_buffer = conf.max_buffer or 500
    if #state.buffer >= max_buffer then
      table.remove(state.buffer, 1)
    end

    local method = kong.request.get_method()
    local path = kong.request.get_path()
    local status = kong.response.get_status()
    local req_headers = kong.request.get_headers() or {}
    local res_headers = kong.response.get_headers() or {}

    local max_body = conf.max_body_bytes or 65536
    local req_ct = req_headers["content-type"] or req_headers["Content-Type"]
    local res_ct = res_headers["content-type"] or res_headers["Content-Type"]

    local req_shape = nil
    -- Best-effort: Kong may expose get_raw_body in access; in log phase body
    -- is often unavailable. Metadata always ships.
    local req_raw = kong.request.get_raw_body and kong.request.get_raw_body() or nil
    if req_raw then
      local decoded = try_parse_json_body(req_raw, req_ct, max_body)
      if decoded ~= nil then
        req_shape = redaction.shape_body(decoded, 0)
      end
    end

    local res_shape = nil
    local response_body_captured = false
    local res_raw = kong.response.get_raw_body and kong.response.get_raw_body() or nil
    if res_raw then
      local decoded = try_parse_json_body(res_raw, res_ct, max_body)
      if decoded ~= nil then
        res_shape = redaction.shape_body(decoded, 0)
        response_body_captured = true
      end
    end

    local latency_ms = 0
    if ngx and ngx.ctx and ngx.ctx.KONG_PROXY_LATENCY then
      latency_ms = tonumber(ngx.ctx.KONG_PROXY_LATENCY) or 0
    elseif ngx.var and ngx.var.request_time then
      latency_ms = (tonumber(ngx.var.request_time) or 0) * 1000
    end

    local caller = redaction.resolve_caller(req_headers, conf.service_name or "kong-gateway")

    local sample = {
      method = string.upper(tostring(method or "GET")),
      path = path or "/",
      statusCode = tonumber(status) or 0,
      latencyMs = latency_ms,
      authObserved = observe_auth(req_headers),
      timestamp = iso_utc(),
      caller = caller,
      request = build_side(req_headers, req_shape, req_ct),
      response = build_side(res_headers, res_shape, res_ct),
      responseBodyCaptured = response_body_captured,
    }

    state.buffer[#state.buffer + 1] = sample
    if #state.buffer >= (conf.max_batch or 50) then
      ngx.timer.at(0, flush)
    end
  end)

  if not ok then
    kong.log.warn("[apiglimpse] log error: ", err)
  end
end

-- Test helpers
function ApiglimpseHandler._state()
  return state
end

function ApiglimpseHandler._flush()
  return flush(false)
end

function ApiglimpseHandler._reset_for_tests()
  state.buffer = {}
  state.flushing = false
  state.consecutive_failures = 0
  state.circuit_open_until = 0
  state.timer_started = false
  state.conf = nil
end

return ApiglimpseHandler
