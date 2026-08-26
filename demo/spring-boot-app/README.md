# Demo Spring Boot app (API Glimpse)

Minimal Spring Boot 3.x app with REST controllers and the `apiglimpse-spring-boot-starter` filter.

## Setup

```bash
# Install the starter into local Maven (~/.m2)
cd connectors/java && ./mvnw install -DskipTests

# Run the demo (from repo root)
cd demo/spring-boot-app
cp .env.example .env   # optional; or export env vars
mvn spring-boot:run
```

App listens on `:4003` by default.

## Try it

```bash
curl -s http://localhost:4003/health
curl -s http://localhost:4003/api/users
curl -s -X POST http://localhost:4003/api/users \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo' \
  -d '{"email":"ada@example.com","name":"Ada","password":"hunter2"}'
```

Samples POST to `{API_SENSOR_AGENT_URL}/v1/samples` with `X-API-Key`.
