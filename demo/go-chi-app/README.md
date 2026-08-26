# Demo — Go chi + API Glimpse

Minimal [chi](https://github.com/go-chi/chi) app wired to the local Go connector.

## Setup

```bash
cd demo/go-chi-app
cp .env.example .env
# edit API_SENSOR_KEY to a project key from the dashboard
go mod tidy
go run .
```

Environment (see `.env.example`):

```bash
API_SENSOR_AGENT_URL=http://localhost:8080
API_SENSOR_KEY=ask_...
PORT=4000
```

With the local stack (agent on `:8080`), hit a few routes and watch inventory appear:

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/api/users
curl -s -X POST http://localhost:4000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"c@example.com","name":"Cara","password":"secret"}'
```

## Connector mount

```go
r.Use(apiglimpse.Middleware(apiglimpse.Config{
  AgentURL: os.Getenv("API_SENSOR_AGENT_URL"),
  APIKey:   os.Getenv("API_SENSOR_KEY"),
}))
```

Module path: `github.com/jantznick/api-security/connectors/go` (local `replace` in this demo’s `go.mod`).
