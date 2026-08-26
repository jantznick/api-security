# Concepts

## API keys

Every batch sent to API Glimpse needs a valid service API key (`ask_…`).

- Create keys in the dashboard (shown once when you create them)
- Set `API_SENSOR_KEY` in your app
- Missing or invalid key → batch rejected; endpoints are not updated
- The key maps to a **service** (one API); endpoint data stays in that service

## Schemas and tags

API Glimpse stores **schemas, counters, and tags** — not long-lived raw request or response bodies.

- Connectors remove secrets (authorization, cookies, and similar) before data leaves your app
- Body field names and types may be inferred from samples
- Samples exist briefly for aggregation, then are discarded

## Endpoint limits

A **service** may have an **endpoint limit** (from your org’s plan snapshot):

- New endpoints over the cap are not added
- Existing endpoints continue to update as traffic arrives
- Admin catalog plan edits change *future* assignments only — your org keeps the limits it received when the plan was assigned

## Path templating

Stable path templates via classifiers (UUID, numeric, hex, email, opaque tokens) plus vocabulary heuristics so `/users/1` and `/users/2` collapse without turning static paths into noise.

## Schema merge

Required fields = intersection across observations; types widen to unions; property fan-out is capped. Merged fragments become the latest view of each endpoint’s fields.

## OpenAPI export

From a service’s inventory in the dashboard, use **Export OpenAPI** to download an OpenAPI 3.0 JSON document built from discovered endpoints (method, path template, request/response schemas, and auth hints). Only paths that appear in inventory are included — nothing is invented.

## Evidence pack (audit export)

From the same inventory page, use **Download evidence pack** to get a dated JSON snapshot suitable for attaching to an audit questionnaire. The pack includes:

- Inventory snapshot (method, path template, hit counts, first/last seen, auth modes)
- Signals list with severity (sensitive-field tags from sampled shapes)
- Generated OpenAPI document for the service
- `generatedAt` timestamp plus organization / project / service ids
- Optional posture summary when risk scoring is available in the deployment

**What this is:** observational evidence of what API Glimpse saw in sampled traffic for that service at export time.

**What this is not:** a SOC 2, ISO 27001, PCI, HIPAA, or other compliance certification; not a legal attestation; not proof that your API surface is complete. Absence of an endpoint or signal does not prove it does not exist. Auth modes are traffic observations, not enforcement guarantees.

## Sampling and availability

Sampling is asynchronous: the connector does not wait on API Glimpse before finishing your request. If API Glimpse is unreachable, samples drop and your app continues to serve traffic. See [Connect your app → Troubleshooting](/integrating#troubleshooting).

## Protect mode (later)

Runtime request blocking is planned for a later release and is **not** enabled today. API Glimpse v1 is discovery: endpoints, schemas, and tags.
