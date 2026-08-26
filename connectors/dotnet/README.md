# API Glimpse — ASP.NET Core connector

NuGet package **`ApiGlimpse.AspNetCore`** — pipeline middleware that samples request/response metadata, redacts secrets client-side, and asynchronously POSTs envelope **v1** to the hosted agent (`POST /v1/samples`).

Fail-open: sampling never blocks or fails your handlers. If the collector is down, samples are dropped and your API keeps serving traffic.

## Install

```bash
dotnet add package ApiGlimpse.AspNetCore
```

In this monorepo (before NuGet publish), reference the project or pack locally:

```bash
cd connectors/dotnet
dotnet pack ApiGlimpse.AspNetCore/ApiGlimpse.AspNetCore.csproj -c Release -o ./nupkg
dotnet add path/to/YourApp.csproj package ApiGlimpse.AspNetCore --source ./nupkg
```

Maintainer publish (nuget.org): see **[docs/CONNECTOR_PUBLISH.md](../../docs/CONNECTOR_PUBLISH.md)** (Nick-only).

## Usage

```csharp
using ApiGlimpse.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApiGlimpse(builder.Configuration);

var app = builder.Build();

app.UseApiGlimpse(); // early in the pipeline

app.MapGet("/health", () => Results.Json(new { status = "ok" }));
app.Run();
```

`appsettings.json` (optional — env vars override when set):

```json
{
  "ApiGlimpse": {
    "AgentUrl": "https://collect.apiglimpse.com",
    "ApiKey": "ask_…",
    "ServiceName": "orders-api",
    "SampleRate": 1.0
  }
}
```

Or load from environment only:

```csharp
builder.Services.AddApiGlimpse(ApiGlimpseOptions.FromEnvironment());
```

## Environment

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (e.g. `https://collect.apiglimpse.com`) |
| `API_SENSOR_KEY` | Project API key (`ask_…`) |
| `API_SENSOR_SAMPLE_RATE` | Optional `0`–`1` (default `1`) |
| `API_SENSOR_SERVICE_NAME` | Optional topology caller label |

Auth: `X-API-Key` header and envelope `apiKey`. Target: `{agentUrl}/v1/samples` (expect `202`).

## Wire contract

Matches `@apiglimpse/shared` envelope v1: header redaction, `shapeBody` caps, secret key redaction, async buffer + flush + circuit breaker.

## Local pack

```bash
cd connectors/dotnet
dotnet pack ApiGlimpse.AspNetCore -c Release -o ./nupkg
```

## Tests

```bash
cd connectors/dotnet
dotnet test
```

## Demo

See [`demo/aspnet-app`](../../demo/aspnet-app).

## Out of scope

Classic .NET Framework / OWIN-only hosts are not supported (ASP.NET Core on .NET 8+).
