# API Glimpse — Go connector

Go module middleware for `net/http` and [chi](https://github.com/go-chi/chi). Samples request/response metadata, redacts secrets client-side, and asynchronously POSTs envelope **v1** to the hosted agent (`POST /v1/samples`).

Fail-open: sampling never blocks or fails your handlers. If the collector is down, samples are dropped and your API keeps serving traffic.

## Install

```bash
# After maintainers push a module tag (e.g. connectors/go/v0.1.0):
go get github.com/jantznick/api-security/connectors/go/apiglimpse@v0.1.0
```

In this monorepo, demos use a `replace` directive to the local module.

Maintainer publish (git tags for the Go module proxy): **[docs/CONNECTOR_PUBLISH.md](../../docs/CONNECTOR_PUBLISH.md)**.

## Quick start (chi)

```go
package main

import (
  "net/http"
  "os"

  "github.com/go-chi/chi/v5"
  "github.com/jantznick/api-security/connectors/go/apiglimpse"
)

func main() {
  r := chi.NewRouter()
  r.Use(apiglimpse.Middleware(apiglimpse.Config{
    AgentURL: os.Getenv("API_SENSOR_AGENT_URL"),
    APIKey:   os.Getenv("API_SENSOR_KEY"),
  }))

  r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
    w.Write([]byte(`{"ok":true}`))
  })
  http.ListenAndServe(":4000", r)
}
```

Or load env defaults:

```go
r.Use(apiglimpse.Middleware(apiglimpse.ConfigFromEnv()))
```

## Environment

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (e.g. `https://collect.apiglimpse.com`) |
| `API_SENSOR_KEY` | Project API key (`ask_…`) |
| `API_SENSOR_SAMPLE_RATE` | Optional `0`–`1` (default `1`) |

Auth: `X-API-Key` header and envelope `apiKey`. Target: `{agentUrl}/v1/samples` (expect `202`).

## Wire contract

Matches `@apiglimpse/shared` envelope v1: header redaction, `shapeBody` caps, secret key redaction, async buffer + flush + circuit breaker.

## Tests

```bash
cd connectors/go
go test ./...
```

## Demo

See [`demo/go-chi-app`](../../demo/go-chi-app).
