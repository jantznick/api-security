/**
 * SF6 — outbound workflow webhooks (Zapier/Make) + Slack incoming webhooks.
 * Fire-and-forget; never block inventory upsert on delivery failure.
 */

export const HIGH_SEVERITIES = new Set(['high', 'critical']);

const WEBHOOK_TIMEOUT_MS = Number(process.env.OUTBOUND_WEBHOOK_TIMEOUT_MS || 4000);

/**
 * @param {string | null | undefined} severity
 */
export function isHighSeverity(severity) {
  return HIGH_SEVERITIES.has(String(severity || '').toLowerCase());
}

/**
 * Resolve effective webhook URLs: service overrides project.
 * @param {{ webhookUrl?: string | null, slackWebhookUrl?: string | null } | null} service
 * @param {{ webhookUrl?: string | null, slackWebhookUrl?: string | null } | null} project
 */
export function resolveIntegrationUrls(service, project) {
  return {
    webhookUrl: (service?.webhookUrl || project?.webhookUrl || '').trim() || null,
    slackWebhookUrl: (service?.slackWebhookUrl || project?.slackWebhookUrl || '').trim() || null,
  };
}

/**
 * Canonical JSON payload for Zapier / Make / generic receivers.
 * Documented in docs/INTEGRATIONS_WEBHOOKS.md.
 *
 * @param {object} opts
 * @param {string} opts.event — e.g. signal.high_severity | integrations.test
 * @param {object} [opts.service]
 * @param {object} [opts.project]
 * @param {object} [opts.endpoint]
 * @param {object} [opts.signal]
 * @param {object} [opts.extra]
 */
export function buildOutboundWebhookPayload({
  event,
  service,
  project,
  endpoint,
  signal,
  extra,
}) {
  return {
    version: 1,
    event: String(event || 'unknown'),
    occurredAt: new Date().toISOString(),
    service: service
      ? {
          id: service.id,
          name: service.name,
          projectId: service.projectId ?? project?.id ?? null,
        }
      : null,
    project: project
      ? {
          id: project.id,
          name: project.name,
          organizationId: project.organizationId ?? null,
        }
      : null,
    endpoint: endpoint
      ? {
          id: endpoint.id,
          method: endpoint.method,
          pathTemplate: endpoint.pathTemplate,
        }
      : null,
    signal: signal
      ? {
          id: signal.id ?? null,
          type: signal.type,
          fieldPath: signal.fieldPath,
          category: signal.category,
          severity: signal.severity,
        }
      : null,
    ...(extra && typeof extra === 'object' ? { extra } : {}),
  };
}

/**
 * @param {string} url
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function postGenericWebhook(url, payload) {
  if (!url) return { ok: false, error: 'webhookUrl not set' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'APIGlimpse-Webhooks/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err?.message || 'webhook delivery failed' };
  }
}

/**
 * Slack incoming webhook: text + optional Block Kit.
 * @param {string} url
 * @param {{ text: string, blocks?: object[] }} body
 */
export async function postSlackWebhook(url, body) {
  if (!url) return { ok: false, error: 'slackWebhookUrl not set' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: body.text,
        blocks: body.blocks,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err?.message || 'slack delivery failed' };
  }
}

/**
 * @param {object} ctx
 */
export function buildSlackHighSeverityMessage(ctx) {
  const method = ctx.endpoint?.method || '?';
  const path = ctx.endpoint?.pathTemplate || '?';
  const sev = ctx.signal?.severity || 'high';
  const cat = ctx.signal?.category || 'signal';
  const field = ctx.signal?.fieldPath || '';
  const serviceName = ctx.service?.name || 'service';
  const text = `[API Glimpse] ${sev.toUpperCase()} signal on ${serviceName}: ${method} ${path} — ${cat}${field ? ` (${field})` : ''}`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `High-severity signal: ${cat}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Service*\n${serviceName}` },
        { type: 'mrkdwn', text: `*Severity*\n${sev}` },
        { type: 'mrkdwn', text: `*Endpoint*\n\`${method} ${path}\`` },
        { type: 'mrkdwn', text: `*Field*\n\`${field || '—'}\`` },
      ],
    },
  ];

  return { text, blocks };
}

/**
 * Notify configured destinations for a newly created high-severity signal.
 * Does not throw; logs and returns results.
 *
 * @param {object} opts
 * @param {object} opts.service — must include webhook fields; project optional nested or separate
 * @param {object} [opts.project]
 * @param {object} opts.endpoint
 * @param {object} opts.signal
 */
export async function notifyHighSeveritySignal({ service, project, endpoint, signal }) {
  if (!isHighSeverity(signal?.severity)) {
    return { skipped: true, reason: 'not_high_severity' };
  }

  const proj = project || service?.project || null;
  const { webhookUrl, slackWebhookUrl } = resolveIntegrationUrls(service, proj);

  if (!webhookUrl && !slackWebhookUrl) {
    return { skipped: true, reason: 'no_webhooks_configured' };
  }

  const payload = buildOutboundWebhookPayload({
    event: 'signal.high_severity',
    service,
    project: proj,
    endpoint,
    signal,
  });

  const results = { webhook: null, slack: null };

  if (webhookUrl) {
    results.webhook = await postGenericWebhook(webhookUrl, payload);
  }
  if (slackWebhookUrl) {
    results.slack = await postSlackWebhook(
      slackWebhookUrl,
      buildSlackHighSeverityMessage({ service, project: proj, endpoint, signal }),
    );
  }

  return results;
}

/**
 * Manual test from settings UI.
 */
export async function sendIntegrationTest({ service, project, channel }) {
  const proj = project || service?.project || null;
  const { webhookUrl, slackWebhookUrl } = resolveIntegrationUrls(service, proj);

  if (channel === 'slack') {
    if (!slackWebhookUrl) return { ok: false, error: 'slackWebhookUrl not set' };
    return postSlackWebhook(slackWebhookUrl, {
      text: `[API Glimpse] Test message for ${service?.name || 'service'} — Slack webhook is working.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*API Glimpse test*\nService *${service?.name || 'service'}* Slack webhook is configured correctly.`,
          },
        },
      ],
    });
  }

  if (!webhookUrl) return { ok: false, error: 'webhookUrl not set' };
  const payload = buildOutboundWebhookPayload({
    event: 'integrations.test',
    service,
    project: proj,
    extra: { message: 'Manual test from API Glimpse service settings' },
  });
  return postGenericWebhook(webhookUrl, payload);
}
