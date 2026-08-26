-- Kong plugin schema for API Glimpse (envelope v1 sampler).
-- Fail-open discovery only — no protect / ACL.

local typedefs = require "kong.db.schema.typedefs"

return {
  name = "apiglimpse",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    {
      config = {
        type = "record",
        fields = {
          {
            agent_url = {
              type = "string",
              required = true,
              default = "https://collect.apiglimpse.com",
            },
          },
          {
            api_key = {
              type = "string",
              required = true,
            },
          },
          {
            service_name = {
              type = "string",
              required = false,
              default = "kong-gateway",
            },
          },
          {
            sample_rate = {
              type = "number",
              required = false,
              default = 1,
              between = { 0, 1 },
            },
          },
          {
            flush_interval_ms = {
              type = "number",
              required = false,
              default = 1000,
            },
          },
          {
            max_batch = {
              type = "number",
              required = false,
              default = 50,
            },
          },
          {
            max_buffer = {
              type = "number",
              required = false,
              default = 500,
            },
          },
          {
            request_timeout_ms = {
              type = "number",
              required = false,
              default = 2000,
            },
          },
          {
            circuit_failure_threshold = {
              type = "number",
              required = false,
              default = 3,
            },
          },
          {
            circuit_open_ms = {
              type = "number",
              required = false,
              default = 15000,
            },
          },
          {
            max_body_bytes = {
              type = "number",
              required = false,
              default = 65536,
            },
          },
        },
      },
    },
  },
}
