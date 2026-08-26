# Demo Flask app + API Glimpse

Minimal Flask service instrumented with the `apiglimpse` Flask extension.

## Setup

```bash
# from repo root
python3 -m venv .venv
source .venv/bin/activate
pip install -r demo/flask-app/requirements.txt
cp demo/flask-app/.env.example demo/flask-app/.env
```

## Run

```bash
cd demo/flask-app
flask --app app run --host 0.0.0.0 --port ${PORT:-4004} --debug
```

Traffic is sampled and POSTed to `$API_SENSOR_AGENT_URL/v1/samples` with `X-API-Key`.

## Try it

```bash
curl -s localhost:4004/health
curl -s localhost:4004/api/users
curl -s -X POST localhost:4004/api/users \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","password":"secret","ssn":"123-45-6789"}'
curl -s -X POST localhost:4004/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"secret"}'
```
