-- API Glimpse Nginx / OpenResty sampler (envelope v1)
-- Requires OpenResty or nginx + lua-nginx-module. Stock Nginx without Lua is unsupported.
-- Fail-open: never ngx.exit / never fail the client request on collector errors.

local _M = {}

local cjson = require "cjson.safe"
local redaction = require "redaction"

local cfg = {
  agent_url = "http://127.0.0.1:8080",
  api_key = "",
  service_name = "nginx-gateway",
  sample_rate = 1.0,
  flush_interval_ms = 1000,
  max_batch = 50,
  max_buffer = 500,
  request_timeout_ms = 2000,
  circuit_failure_threshold = 3,
  circuit_open_ms = 15000,
  max_body_bytes = 65536, -- 64 KiB
}

local buffer = {}
local flushing = false
local consecutive_failures = 0
local circuit_open_until = 0 -- ngx.now() seconds
local http_client -- lazy resty.http

local function now_ms()
  -- ngx.now is seconds with msec fraction
  return (ngx.now and ngx.now() or os.time()) * 1000
end

local function iso_utc()
  return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

local function getenv_num(name, default)
  local v = os.getenv(name)
  if v == nil or v == "" then
    return default
  end
  local n = tonumber(v)
  if n == nil then
    return default
  end
  return n
end

local function should_sample()
  if cfg.sample_rate >= 1 then
    return true
  end
  if cfg.sample_rate <= 0 then
    return false
  end
  return math.random() < cfg.sample_rate
end

local function circuit_open()
  return now_ms() < circuit_open_until
end

local function record_failure()
  consecutive_failures = consecutive_failures + 1
  if consecutive_failures >= cfg.circuit_failure_threshold then
    circuit_open_until = now_ms() + cfg.circuit_open_ms
    consecutive_failures = 0
    ngx.log(ngx.WARN, "[apiglimpse] circuit open for ", cfg.circuit_open_ms, "ms")
  end
end

local function record_success()
  consecutive_failures = 0
  circuit_open_until = 0
end

local function get_http()
  if http_client then
    return http_client
  end
  local ok, http = pcall(require, "resty.http")
  if not ok or not http then
    return nil, "resty.http not available (install lua-resty-http)"
  end
  http_client = http
  return http
end

--- Best-effort JSON body parse within size cap.
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
  local decoded = cjson.decode(raw)
  return decoded
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

local function flush(premature)
  if premature then
    return
  end
  if flushing or #buffer == 0 then
    return
  end
  if circuit_open() then
    return
  end

  flushing = true
  local batch = {}
  local n = math.min(#buffer, cfg.max_batch)
  for i = 1, n do
    batch[i] = table.remove(buffer, 1)
  end

  local ok_all, err_all = pcall(function()
    local http, herr = get_http()
    if not http then
      ngx.log(ngx.WARN, "[apiglimpse] flush skipped: ", herr)
      record_failure()
      -- re-queue dropped? fail-open drop to avoid unbounded growth under missing dep
      return
    end

    local httpc = http.new()
    httpc:set_timeout(cfg.request_timeout_ms)

    local url = cfg.agent_url:gsub("/$", "") .. "/v1/samples"
    local body = cjson.encode({
      version = 1,
      apiKey = cfg.api_key,
      samples = batch,
      sentAt = iso_utc(),
    })

    local res, err = httpc:request_uri(url, {
      method = "POST",
      headers = {
        ["Content-Type"] = "application/json",
        ["X-API-Key"] = cfg.api_key or "",
      },
      body = body,
    })

    if not res then
      ngx.log(ngx.WARN, "[apiglimpse] flush failed: ", err)
      record_failure()
      return
    end

    local status = tonumber(res.status) or 0
    if status >= 500 then
      record_failure()
    elseif status == 401 then
      -- bad key — drop, do not trip circuit forever
      ngx.log(ngx.WARN, "[apiglimpse] collector rejected API key (401)")
    else
      record_success()
    end
  end)

  flushing = false
  if not ok_all then
    ngx.log(ngx.WARN, "[apiglimpse] flush error: ", err_all)
    record_failure()
  end
end

local function read_env_defaults()
  local agent = os.getenv("API_SENSOR_AGENT_URL")
  if agent and agent ~= "" then
    cfg.agent_url = agent
  end
  local key = os.getenv("API_SENSOR_KEY")
  if key and key ~= "" then
    cfg.api_key = key
  end
  local svc = os.getenv("API_SENSOR_SERVICE_NAME")
  if svc and svc ~= "" then
    cfg.service_name = svc
  end
  cfg.sample_rate = getenv_num("API_SENSOR_SAMPLE_RATE", cfg.sample_rate)
  cfg.max_body_bytes = getenv_num("API_SENSOR_MAX_BODY_BYTES", cfg.max_body_bytes)
end

function _M.init(opts)
  read_env_defaults()
  opts = opts or {}
  for k, v in pairs(opts) do
    if v ~= nil then
      cfg[k] = v
    end
  end

  -- Map alternate option names from docs / env-shaped configs
  if opts.agentUrl then
    cfg.agent_url = opts.agentUrl
  end
  if opts.apiKey then
    cfg.api_key = opts.apiKey
  end
  if opts.serviceName then
    cfg.service_name = opts.serviceName
  end
  if opts.sampleRate ~= nil then
    cfg.sample_rate = tonumber(opts.sampleRate) or cfg.sample_rate
  end
  if opts.flushIntervalMs then
    cfg.flush_interval_ms = opts.flushIntervalMs
  end
  if opts.maxBatchSize then
    cfg.max_batch = opts.maxBatchSize
  end
  if opts.maxBodyBytes then
    cfg.max_body_bytes = opts.maxBodyBytes
  end

  local every = math.max(0.2, (cfg.flush_interval_ms or 1000) / 1000)
  local ok, err = ngx.timer.every(every, flush)
  if not ok then
    ngx.log(ngx.ERR, "[apiglimpse] timer failed: ", err)
  end
end

--- Optional: call from access_by_lua / rewrite to buffer request body for shaping.
function _M.capture_request_body()
  local ok, err = pcall(function()
    ngx.req.read_body()
    local data = ngx.req.get_body_data()
    if not data then
      local path = ngx.req.get_body_file()
      if path then
        -- Oversized / spilled to file — skip shaping (metadata-only)
        ngx.ctx.apiglimpse_req_body = nil
        ngx.ctx.apiglimpse_req_oversize = true
        return
      end
    end
    if data and #data > cfg.max_body_bytes then
      ngx.ctx.apiglimpse_req_body = nil
      ngx.ctx.apiglimpse_req_oversize = true
      return
    end
    ngx.ctx.apiglimpse_req_body = data
  end)
  if not ok then
    ngx.log(ngx.WARN, "[apiglimpse] capture_request_body: ", err)
  end
end

--- Optional: call from body_filter_by_lua_block to buffer JSON response (capped).
function _M.capture_response_chunk()
  local ok, err = pcall(function()
    local chunk = ngx.arg[1]
    local eof = ngx.arg[2]
    if ngx.ctx.apiglimpse_res_skip then
      return
    end
    if chunk and chunk ~= "" then
      local buf = ngx.ctx.apiglimpse_res_body or ""
      if #buf + #chunk > cfg.max_body_bytes then
        ngx.ctx.apiglimpse_res_skip = true
        ngx.ctx.apiglimpse_res_body = nil
        return
      end
      ngx.ctx.apiglimpse_res_body = buf .. chunk
    end
    if eof then
      -- keep buffered body for log phase
    end
  end)
  if not ok then
    ngx.log(ngx.WARN, "[apiglimpse] capture_response_chunk: ", err)
  end
end

function _M.log_request()
  local ok, err = pcall(function()
    if not should_sample() then
      return
    end
    if #buffer >= cfg.max_buffer then
      table.remove(buffer, 1)
    end

    local method = ngx.req.get_method()
    local path = ngx.var.uri or "/"
    local status = tonumber(ngx.status) or 0
    local req_headers = ngx.req.get_headers() or {}
    local auth = redaction.observe_auth(req_headers)

    local req_ct = req_headers["content-type"] or req_headers["Content-Type"]
    local req_raw = ngx.ctx.apiglimpse_req_body
    if not req_raw and not ngx.ctx.apiglimpse_req_oversize then
      -- Best-effort if lua_need_request_body on without explicit capture
      local data = ngx.req.get_body_data()
      if data and #data <= cfg.max_body_bytes then
        req_raw = data
      end
    end
    local req_shape = nil
    if req_raw then
      local decoded = try_parse_json_body(req_raw, req_ct, cfg.max_body_bytes)
      if decoded ~= nil then
        req_shape = redaction.shape_body(decoded, 0)
      end
    end

    local res_headers = {}
    -- ngx.resp.get_headers available in OpenResty
    if ngx.resp and ngx.resp.get_headers then
      res_headers = ngx.resp.get_headers() or {}
    elseif ngx.header then
      for k, v in pairs(ngx.header) do
        res_headers[k] = v
      end
    end
    local res_ct = res_headers["content-type"]
      or res_headers["Content-Type"]
      or ngx.header["Content-Type"]

    local res_raw = ngx.ctx.apiglimpse_res_body
    local res_shape = nil
    local response_body_captured = false
    if res_raw and not ngx.ctx.apiglimpse_res_skip then
      local decoded = try_parse_json_body(res_raw, res_ct, cfg.max_body_bytes)
      if decoded ~= nil then
        res_shape = redaction.shape_body(decoded, 0)
        response_body_captured = true
      end
    end

    local caller = redaction.resolve_caller(req_headers, cfg.service_name)

    local sample = {
      method = string.upper(tostring(method or "GET")),
      path = path,
      statusCode = status,
      latencyMs = tonumber(ngx.var.request_time) and (tonumber(ngx.var.request_time) * 1000) or 0,
      authObserved = auth,
      timestamp = iso_utc(),
      caller = caller,
      request = build_side(req_headers, req_shape, req_ct),
      response = build_side(res_headers, res_shape, res_ct),
      responseBodyCaptured = response_body_captured,
    }

    buffer[#buffer + 1] = sample
    if #buffer >= cfg.max_batch then
      ngx.timer.at(0, flush)
    end
  end)
  if not ok then
    ngx.log(ngx.WARN, "[apiglimpse] log_request error: ", err)
  end
end

-- Test helpers (avoid using in production config)
function _M._cfg()
  return cfg
end

function _M._buffer()
  return buffer
end

function _M._circuit_open()
  return circuit_open()
end

function _M._record_failure()
  return record_failure()
end

function _M._flush()
  return flush(false)
end

function _M._reset_for_tests()
  buffer = {}
  flushing = false
  consecutive_failures = 0
  circuit_open_until = 0
end

return _M
