# Demo Django app + API Glimpse

Minimal Django service instrumented with `apiglimpse` middleware.

## Setup

```bash
# from repo root
python3 -m venv .venv
source .venv/bin/activate
pip install -r demo/django-app/requirements.txt
cp demo/django-app/.env.example demo/django-app/.env
```

## Run

```bash
cd demo/django-app
python manage.py runserver 0.0.0.0:${PORT:-4003}
```

Traffic is sampled and POSTed to `$API_SENSOR_AGENT_URL/v1/samples` with `X-API-Key`.

## Try it

```bash
curl -s localhost:4003/health
curl -s localhost:4003/api/users
curl -s -X POST localhost:4003/api/users \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","password":"secret","ssn":"123-45-6789"}'
curl -s -X POST localhost:4003/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"secret"}'
```
