# API Glimpse — Python connector (`apiglimpse`)

FastAPI / Starlette middleware that samples API traffic, redacts secrets client-side, and POSTs **envelope version 1** to the hosted API Glimpse agent.

## Install

```bash
# After PyPI publish (see docs/CONNECTOR_PUBLISH.md):
pip install apiglimpse

# Local monorepo / before first publish:
pip install -e ./connectors/python
```

Maintainer publish (build + twine, TestPyPI, version bumps): **[docs/CONNECTOR_PUBLISH.md](../../docs/CONNECTOR_PUBLISH.md)**.

## Usage

```python
from fastapi import FastAPI
from apiglimpse import ApiGlimpseMiddleware

app = FastAPI()
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url="http://localhost:8080",
    api_key="ask_…",
)
```

## Environment

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (default `http://localhost:8080`) |
| `API_SENSOR_KEY` | Project API key (`X-API-Key` + envelope `apiKey`) |
| `API_SENSOR_SAMPLE_RATE` | Optional 0–1 sample rate (default `1`) |

Target: `POST {agentUrl}/v1/samples` → expect `202`.

## Behavior

- **Fail-open** — sampling never blocks or fails the customer request
- **Async flush** — buffer + periodic / max-batch POST
- **Circuit breaker** — backs off after consecutive collector failures
- **Redaction** — mirrors `@apiglimpse/shared` (`SENSITIVE_HEADER_NAMES`, `shapeBody` caps 64/4/40/5)

## Develop

```bash
cd connectors/python
pip install -e ".[dev]"
pytest
```
