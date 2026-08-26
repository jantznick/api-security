# Integrations — outbound webhooks & Slack (SF6)

API Glimpse can notify your workflow tools when a **new high/critical severity signal** appears during inventory ingest (and when you click **Test** in service settings).

No Jira/Linear OAuth in this phase — use the generic webhook with Zapier/Make for tickets.

## Settings

On **Service settings → Workflow integrations**:

| Field | Purpose |
| --- | --- |
| `webhookUrl` | Generic HTTPS POST (Zapier Catch Hook, Make, n8n, …) |
| `slackWebhookUrl` | [Slack Incoming Webhook](https://api.slack.com/messaging/webhooks) URL |

Service URLs override optional Project-level `webhookUrl` / `slackWebhookUrl` when those are set in the DB.

## When we fire

1. **Automatic:** ingest upsert creates a *new* `Signal` with severity `high` or `critical`.
2. **Manual:** `POST /api/services/:serviceId/integrations/webhook/test` or `.../slack/test` (session auth).

Delivery is fire-and-forget (few-second timeout). Failures are logged; inventory upsert never waits on webhooks.

## Generic webhook JSON (v1)

```json
{
  "version": 1,
  "event": "signal.high_severity",
  "occurredAt": "2026-08-26T17:00:00.000Z",
  "service": {
    "id": "uuid",
    "name": "Payments API",
    "projectId": "uuid"
  },
  "project": {
    "id": "uuid",
    "name": "Default",
    "organizationId": "uuid"
  },
  "endpoint": {
    "id": "uuid",
    "method": "POST",
    "pathTemplate": "/checkout"
  },
  "signal": {
    "id": "uuid",
    "type": "sensitive_field",
    "fieldPath": "body.pan",
    "category": "card",
    "severity": "high"
  }
}
```

Manual test uses `"event": "integrations.test"` and may include `"extra": { "message": "..." }` with `endpoint` / `signal` null.

### Zapier / Make

1. Create a Catch Hook (Zapier) or Custom Webhook (Make).
2. Paste the URL into **Outbound webhook URL** and save.
3. Click **Test webhook** — map fields from the JSON above into Slack/Jira/Linear steps.

## Slack payload

Slack receives Incoming Webhook JSON with `text` plus Block Kit `blocks` (header + fields for service, severity, endpoint, field path).

## API

```http
GET    /api/services/:serviceId/integrations
PATCH  /api/services/:serviceId/integrations
       Body: { "webhookUrl": "https://...", "slackWebhookUrl": "https://..." }
POST   /api/services/:serviceId/integrations/webhook/test
POST   /api/services/:serviceId/integrations/slack/test
```

Nested under `/api/projects/:projectId/services/:serviceId/...` as well.

Empty string clears a URL.
