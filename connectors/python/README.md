# API Glimpse — Python connector (`apiglimpse`)

FastAPI / Starlette middleware, Django middleware, and Flask extension that sample API traffic, redact secrets client-side, and POST **envelope version 1** to the hosted API Glimpse agent.

## Install

```bash
# After PyPI publish (see docs/CONNECTOR_PUBLISH.md):
pip install apiglimpse

# Framework extras (optional — only needed if you want declared deps):
pip install "apiglimpse[django]"
pip install "apiglimpse[flask]"

# Local monorepo / before first publish:
pip install -e "./connectors/python[dev]"
```

Maintainer publish (build + twine, TestPyPI, version bumps): **[docs/CONNECTOR_PUBLISH.md](../../docs/CONNECTOR_PUBLISH.md)**.

## FastAPI

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

## Django

```python
# settings.py
MIDDLEWARE = [
    # ...
    "apiglimpse.django.ApiGlimpseDjangoMiddleware",
]

# Optional overrides (env API_SENSOR_* still wins when these are omitted):
APIGLIMPSE = {
    "AGENT_URL": "http://localhost:8080",
    "API_KEY": "ask_…",
    "SAMPLE_RATE": 1.0,
    "SERVICE_NAME": "my-django-api",
}
```

## Flask

```python
from flask import Flask
from apiglimpse.flask import ApiGlimpse

app = Flask(__name__)
ApiGlimpse(
    app,
    agent_url="http://localhost:8080",
    api_key="ask_…",
    service_name="my-flask-api",
)
```

## Environment

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (default `http://localhost:8080`) |
| `API_SENSOR_KEY` | Project API key (`X-API-Key` + envelope `apiKey`) |
| `API_SENSOR_SAMPLE_RATE` | Optional 0–1 sample rate (default `1`) |
| `API_SENSOR_SERVICE_NAME` | Optional caller service name for topology |

Target: `POST {agentUrl}/v1/samples` → expect `202`.

## Behavior

- **Fail-open** — sampling never blocks or fails the customer request
- **Async / threaded flush** — buffer + periodic / max-batch POST (async for FastAPI, background thread for Django/Flask)
- **Circuit breaker** — backs off after consecutive collector failures
- **Redaction** — mirrors `@apiglimpse/shared` (`SENSITIVE_HEADER_NAMES`, `shapeBody` caps 64/4/40/5)

## Demos

- [`demo/fastapi-app`](../../demo/fastapi-app)
- [`demo/django-app`](../../demo/django-app)
- [`demo/flask-app`](../../demo/flask-app)

## Develop

```bash
cd connectors/python
pip install -e ".[dev]"
pytest
```
