package = "kong-plugin-apiglimpse"
version = "0.1.0-1"
source = {
  url = "git+https://github.com/jantznick/api-security.git",
  tag = "connectors/kong/v0.1.0",
}
description = {
  summary = "Kong plugin — API Glimpse traffic discovery (envelope v1)",
  homepage = "https://github.com/jantznick/api-security/tree/main/connectors/kong",
  license = "MIT",
}
dependencies = {
  "lua >= 5.1",
}
build = {
  type = "builtin",
  modules = {
    ["kong.plugins.apiglimpse.handler"] = "kong/plugins/apiglimpse/handler.lua",
    ["kong.plugins.apiglimpse.schema"] = "kong/plugins/apiglimpse/schema.lua",
    ["kong.plugins.apiglimpse.redaction"] = "kong/plugins/apiglimpse/redaction.lua",
  },
}
