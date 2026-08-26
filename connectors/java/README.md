# API Glimpse — Spring Boot starter (`apiglimpse-spring-boot-starter`)

Java Spring Boot 3.x Servlet filter that samples API traffic, redacts secrets client-side, and asynchronously POSTs **envelope version 1** to the hosted API Glimpse agent.

Fail-open: sampling never blocks or fails your handlers. If the collector is down, samples are dropped and your API keeps serving traffic.

## Install (local)

Until Maven Central publish:

```bash
cd connectors/java
./mvnw install -DskipTests   # or: mvn install
```

Then add to your app `pom.xml`:

```xml
<dependency>
  <groupId>com.apiglimpse</groupId>
  <artifactId>apiglimpse-spring-boot-starter</artifactId>
  <version>0.1.0</version>
</dependency>
```

Gradle:

```gradle
implementation 'com.apiglimpse:apiglimpse-spring-boot-starter:0.1.0'
```

Maintainer publish (Sonatype / Maven Central): **[docs/CONNECTOR_PUBLISH.md](../../docs/CONNECTOR_PUBLISH.md)** (Nick-only).

## Usage

Auto-configuration registers an `OncePerRequestFilter` when the app is a Servlet web application. No code required beyond the dependency + env/props:

```properties
apiglimpse.agent-url=https://collect.apiglimpse.com
apiglimpse.api-key=ask_…
# optional
apiglimpse.sample-rate=1.0
apiglimpse.service-name=orders-api
```

Or environment variables (preferred in deploy):

| Variable | Purpose |
| --- | --- |
| `API_SENSOR_AGENT_URL` | Collector base URL (default `http://localhost:8080`) |
| `API_SENSOR_KEY` | Project API key (`X-API-Key` + envelope `apiKey`) |
| `API_SENSOR_SAMPLE_RATE` | Optional `0`–`1` (default `1`) |
| `API_SENSOR_SERVICE_NAME` | Optional topology caller label |

Target: `POST {agentUrl}/v1/samples` with header `X-API-Key` → expect `202`.

Disable with `apiglimpse.enabled=false`.

## Behavior

- **Fail-open** — sampling never blocks or fails the customer request
- **Async flush** — buffer + periodic / max-batch POST
- **Circuit breaker** — backs off after consecutive collector failures
- **Redaction** — mirrors `@apiglimpse/shared` (`SENSITIVE_HEADER_NAMES`, `shapeBody` caps 64/4/40/5, secret field names)

Servlet MVP only (WebFlux is a follow-up).

## Develop / test

```bash
cd connectors/java
./mvnw test   # or: mvn test
```

Golden fixtures under `src/test/resources/fixtures/` mirror `packages/shared/fixtures/`.

## Demo

See [`demo/spring-boot-app`](../../demo/spring-boot-app).
