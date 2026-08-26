# Demo Next.js App Router app for `@apiglimpse/next`

Minimal App Router demo with Route Handlers wrapped by API Glimpse.

## Run

```bash
# Terminal 1 — collector (from repo root)
cd agent && go run .   # or your usual agent start

# Terminal 2 — demo
cd demo/next-app
cp .env.example .env.local   # set API_SENSOR_KEY
npm install
npm run dev
```

App listens on `:4002` by default.

```bash
curl -s http://localhost:4002/api/health
curl -s http://localhost:4002/api/users
curl -s -X POST http://localhost:4002/api/users \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","password":"secret"}'
```

See [packages/next/README.md](../../packages/next/README.md) for body-read / Edge limitations.
