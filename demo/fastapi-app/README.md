# Demo FastAPI app + API Glimpse

Minimal FastAPI service instrumented with `apiglimpse` middleware.

## Setup

```bash
# from repo root
python3 -m venv .venv
source .venv/bin/activate
pip install -r demo/fastapi-app/requirements.txt
cp demo/fastapi-app/.env.example demo/fastapi-app/.env
```

## Run

```bash
cd demo/fastapi-app
uvicorn main:app --host 0.0.0.0 --port ${PORT:-4002} --reload
```

Traffic is sampled and POSTed to `$API_SENSOR_AGENT_URL/v1/samples` with `X-API-Key`.

## Try it

```bash
curl -s localhost:4002/health
curl -s localhost:4002/api/users
curl -s -X POST localhost:4002/api/users \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","password":"secret","ssn":"123-45-6789"}'
curl -s -X POST localhost:4002/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"secret"}'
```
