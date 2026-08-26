package = "apiglimpse-nginx"
version = "scm-1"
source = {
  url = "git+https://github.com/jantznick/api-security.git",
}
description = {
  summary = "API Glimpse OpenResty / Nginx Lua sampler (envelope v1)",
  detailed = [[
Posts fail-open traffic samples to collect.apiglimpse.com.
Requires OpenResty (or nginx + lua-nginx-module) and lua-resty-http.
Stock Nginx without Lua is unsupported.
]],
  homepage = "https://apiglimpse.com",
  license = "MIT",
}
dependencies = {
  "lua >= 5.1",
  "lua-cjson",
  "lua-resty-http",
}
build = {
  type = "builtin",
  modules = {
    apiglimpse = "apiglimpse.lua",
    redaction = "redaction.lua",
  },
}
