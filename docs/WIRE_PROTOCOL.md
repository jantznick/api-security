# Wire protocol — implementing a connector

API Glimpse uses **one hosted collector** (`collect.apiglimpse.com`). Language / framework connectors are thin SDKs that sample app traffic and POST the same JSON envelope. If the envelope matches, the cloud side needs no per-language changes.

Golden fixtures (conformance): `packages/shared/fixtures/`.

## Endpoint

```http
POST {API_SENSOR_AGENT_URL}/v1/samples
Content-Type: application/json
X-API-Key: ask_…
```

Expect **202** `{ "accepted": <n> }` on success.

| Status | Meaning |
| --- | --- |
| 202 | Accepted (processed async) |
| 400 | Invalid envelope |
| 401 | Missing or invalid API key (batch dropped; no aggregation) |
| 429 | Rate limited |
| 503 | Auth/introspect temporarily unavailable |

## Envelope v1

```json
{
  "version": 1,
  "apiKey": "ask_…",
  "samples": [ /* Sample[] */ ],
  "sentAt": "ISO-8601"
}
```

### Sample (required fields)

| Field | Notes |
| --- | --- |
| `method`, `path`, `statusCode`, `latencyMs`, `authObserved`, `timestamp` | Path as seen by the app (agent templates it) |
| `request` / `response` | `contentType`, `headerNames`, `headers` (redacted), `bodyShape` |

See `packages/shared/fixtures/sample-shaped.json` for a full shaped example and `envelope-v1-minimal.json` for the empty-batch envelope.

## Behavioral contract

1. **Fail-open** — never block or fail the customer request because of API Glimpse.
2. **Async flush** — buffer + periodic / max-batch POST; circuit breaker on collector failures.
3. **Client-side redaction** — strip secrets before leave-app (mirror `SENSITIVE_HEADER_NAMES` + `shapeBody` caps in `@apiglimpse/shared`).
4. **Auth** — send `X-API-Key` (and envelope `apiKey`). The agent validates via ingest introspect **before** 202.
5. **Env** — `API_SENSOR_AGENT_URL`, `API_SENSOR_KEY`, optional `API_SENSOR_SAMPLE_RATE`.

Non-JS connectors **reimplement** redaction/shaping to match envelope v1 (do not depend on `@apiglimpse/shared` from Python/Go). Compare output to the golden fixtures above.

## Reference

- Shared helpers: `@apiglimpse/shared` (`createSample`, `createEnvelope`, `validateEnvelope`)
- Express: `@apiglimpse/middleware` · Fastify: `@apiglimpse/fastify`
- Python: `apiglimpse` (PyPI) · Go: `github.com/jantznick/api-security/connectors/go/apiglimpse`
- Product install guide: [INTEGRATING.md](./INTEGRATING.md)
- Maintainer publish (npm / PyPI / Go tags): [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md)
