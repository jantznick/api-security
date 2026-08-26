-- API Glimpse Nginx sampler (OpenResty / lua-nginx-module)
-- Fail-open: never ngx.exit on collector errors.

local _M = {}

local cjson = require "cjson.safe"
local http = require "resty.http"

local cfg = {
  agent_url = "http://127.0.0.1:8080",
  api_key = "",
  service_name = "nginx-gateway",
  sample_rate = 1.0,
  flush_interval_ms = 1000,
  max_batch = 50,
}

local buffer = {}

local function should_sample()
  if cfg.sample_rate >= 1 then return true end
  if cfg.sample_rate <= 0 then return false end
  return math.random() < cfg.sample_rate
end

local function flush(premature)
  if premature then return end
  if #buffer == 0 then return end

  local batch = {}
  local n = math.min(#buffer, cfg.max_batch)
  for i = 1, n do
    batch[i] = table.remove(buffer, 1)
  end

  local httpc = http.new()
  httpc:set_timeout(2000)
  local ok, err = httpc:request_uri(cfg.agent_url:gsub("/$", "") .. "/v1/samples", {
    method = "POST",
    headers = {
      ["Content-Type"] = "application/json",
      ["X-API-Key"] = cfg.api_key,
    },
    body = cjson.encode({
      version = 1,
      apiKey = cfg.api_key,
      samples = batch,
      sentAt = ngx.utc_time and (os.date("!%Y-%m-%dT%H:%M:%SZ")) or nil,
    }),
  })
  if not ok then
    ngx.log(ngx.WARN, "[apiglimpse] flush failed: ", err)
  end
end

function _M.init(opts)
  opts = opts or {}
  for k, v in pairs(opts) do
    cfg[k] = v
  end
  local every = math.max(0.2, (cfg.flush_interval_ms or 1000) / 1000)
  local ok, err = ngx.timer.every(every, flush)
  if not ok then
    ngx.log(ngx.ERR, "[apiglimpse] timer failed: ", err)
  end
end

function _M.log_request()
  local ok, err = pcall(function()
    if not should_sample() then return end
    if #buffer >= 500 then
      table.remove(buffer, 1)
    end

    local method = ngx.req.get_method()
    local path = ngx.var.uri or "/"
    local status = tonumber(ngx.status) or 0
    local auth = "none"
    local h = ngx.req.get_headers() or {}
    local authorization = h["authorization"] or h["Authorization"]
    if authorization and tostring(authorization):match("^[Bb]earer%s+") then
      auth = "bearer"
    elseif h["cookie"] or h["Cookie"] then
      auth = "cookie"
    end

    local sample = {
      method = method,
      path = path,
      statusCode = status,
      latencyMs = tonumber(ngx.var.request_time) and (tonumber(ngx.var.request_time) * 1000) or 0,
      authObserved = auth,
      timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
      caller = {
        key = "svc:" .. string.lower(cfg.service_name or "nginx-gateway"),
        label = cfg.service_name or "nginx-gateway",
        serviceName = cfg.service_name or "nginx-gateway",
        userAgentFamily = "unknown",
      },
      request = {
        contentType = h["content-type"],
        headerNames = {},
        headers = {},
        bodyShape = nil,
      },
      response = {
        contentType = ngx.header["Content-Type"],
        headerNames = {},
        headers = {},
        bodyShape = nil,
      },
      responseBodyCaptured = false,
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

return _M
