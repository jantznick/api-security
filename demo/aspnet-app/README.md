# Demo — ASP.NET Core + ApiGlimpse.AspNetCore

Minimal Web API that wires `UseApiGlimpse()` and posts envelope v1 samples to a local or hosted agent.

## Run

```bash
cd demo/aspnet-app
cp .env.example .env   # optional; or set env vars / edit appsettings.json
export $(grep -v '^#' .env | xargs)  # if using .env
dotnet run
```

Listens on `PORT` (default `4000`).

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/users` | List users |
| GET | `/api/users/{id}` | Get user |
| POST | `/api/users` | Create (password/ssn redacted in samples) |
| POST | `/api/auth/login` | Returns a demo JWT-shaped token |
| GET | `/api/orders/{orderId}/items/{itemId}` | Nested route |

## Config

See `.env.example` and `appsettings.json` (`ApiGlimpse` section). Env `API_SENSOR_*` overrides appsettings when set.
