# Use cases

API Glimpse turns live traffic into inventory you can browse and export. These are the stories teams run today — no protect mode or gateway required.

## Docs vs reality

Specs and OpenAPI files drift. Inventory lists the **methods and path templates that actually got hit**, with hit counts. Export OpenAPI from the dashboard to compare “what we documented” vs “what traffic touched.”

## PII and secrets in payloads

Connectors sample **shapes**, not full bodies. When field patterns look like email, token, card, or similar, endpoints get **sensitive-field signals**. In the dashboard, filter inventory for endpoints that have signals.

## OpenAPI bootstrap

Need a starting OpenAPI doc for a service that never had one? Send traffic through a connector, open the service inventory, and use **Export OpenAPI**. The document reflects discovered paths and schemas only — nothing is invented.

## Pre-audit / multi-service surface map

Organize work as **org → project → service**. Each service gets its own API key and endpoint inventory. Walk the tree to see live surface across APIs without reading every repo.

## Auth coverage gaps

Each endpoint records observed **auth modes** (`bearer`, `cookie`, `none`). Filter **No auth observed** to find routes that never showed bearer or cookie auth in sampled traffic — useful before an audit or launch review.

## Next

- [Quick start](/quick-start) — account → connector → dashboard
- [Concepts](/concepts) — schemas, signals, OpenAPI export
- [Connect your app](/integrating) — Express, Fastify, FastAPI, Go
