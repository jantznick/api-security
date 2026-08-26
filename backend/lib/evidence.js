/**
 * SF4 — Dated evidence pack for audits (JSON snapshot).
 *
 * Includes inventory, signals, OpenAPI, and optional posture (when risk.js exists).
 * This is observational evidence from traffic — not a compliance certification.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from './openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.length > 0);
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Optionally load SF1 risk scoring. Missing module = skip posture (no throw).
 * @returns {Promise<{ scoreServicePosture?: Function } | null>}
 */
export async function loadRiskModule() {
  const riskPath = path.join(__dirname, 'risk.js');
  try {
    await access(riskPath);
  } catch {
    return null;
  }
  try {
    return await import('./risk.js');
  } catch {
    return null;
  }
}

/**
 * Flatten inventory rows for the pack (no raw bodies / large schemas).
 * @param {object[]} endpoints
 */
export function buildInventorySnapshot(endpoints) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  return list.map((ep) => ({
    id: ep.id ?? null,
    method: String(ep.method || '').toUpperCase(),
    pathTemplate: ep.pathTemplate ?? null,
    hitCount: typeof ep.hitCount === 'number' ? ep.hitCount : 0,
    firstSeenAt: toIso(ep.firstSeenAt),
    lastSeenAt: toIso(ep.lastSeenAt),
    authModes: asStringArray(ep.authModes),
    statusCodes: asObject(ep.statusCodes),
    contentTypes: asStringArray(ep.contentTypes),
  }));
}

/**
 * Flatten signals across endpoints with severity.
 * @param {object[]} endpoints
 */
export function buildSignalsList(endpoints) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  const signals = [];
  for (const ep of list) {
    const rows = Array.isArray(ep.signals) ? ep.signals : [];
    for (const s of rows) {
      signals.push({
        id: s.id ?? null,
        endpointId: ep.id ?? s.endpointId ?? null,
        method: String(ep.method || '').toUpperCase(),
        pathTemplate: ep.pathTemplate ?? null,
        type: s.type ?? null,
        fieldPath: s.fieldPath ?? null,
        category: s.category ?? null,
        severity: s.severity ?? 'info',
        lastSeenAt: toIso(s.lastSeenAt),
      });
    }
  }
  signals.sort((a, b) => {
    const sev = String(a.severity).localeCompare(String(b.severity));
    if (sev !== 0) return sev;
    const pathCmp = String(a.pathTemplate || '').localeCompare(String(b.pathTemplate || ''));
    if (pathCmp !== 0) return pathCmp;
    return String(a.fieldPath || '').localeCompare(String(b.fieldPath || ''));
  });
  return signals;
}

/**
 * Honest scope note embedded in every pack — not a SOC2/ISO attestation.
 */
export function evidenceAttestationNote() {
  return {
    attested: [
      'Inventory rows reflect endpoints observed in sampled traffic for this service.',
      'Signals are field-level tags inferred from sampled request/response shapes (not raw bodies).',
      'OpenAPI document is generated only from discovered inventory paths and schemas.',
      'generatedAt is the wall-clock time this pack was built.',
    ],
    notAttested: [
      'This pack is not a SOC 2, ISO 27001, PCI DSS, HIPAA, or other compliance certification.',
      'API Glimpse does not attest completeness of your API surface — only what traffic was sampled.',
      'Absence of an endpoint or signal is not proof it does not exist.',
      'Auth modes are traffic observations, not a guarantee of enforcement.',
      'No legal attestation, continuous compliance automation, or auditor letter is implied.',
    ],
  };
}

/**
 * Build a dated evidence pack for a service.
 *
 * @param {{
 *   service: {
 *     id: string,
 *     name?: string,
 *     project?: {
 *       id?: string,
 *       name?: string,
 *       organizationId?: string,
 *       organization?: { id?: string, name?: string, slug?: string }
 *     }
 *   },
 *   endpoints: object[],
 *   generatedAt?: Date|string,
 * }} input
 * @returns {Promise<object>}
 */
export async function buildEvidencePack({ service, endpoints, generatedAt } = {}) {
  const when = toIso(generatedAt) || new Date().toISOString();
  const list = Array.isArray(endpoints) ? endpoints : [];
  const project = service?.project || null;
  const organization = project?.organization || null;

  const openapi = buildOpenApiDocument({
    project: service,
    service,
    endpoints: list,
  });

  /** @type {Record<string, unknown>} */
  const pack = {
    version: '1.0',
    kind: 'api-glimpse-evidence-pack',
    generatedAt: when,
    organization: {
      id: organization?.id || project?.organizationId || null,
      name: organization?.name ?? null,
      slug: organization?.slug ?? null,
    },
    project: {
      id: project?.id ?? null,
      name: project?.name ?? null,
    },
    service: {
      id: service?.id ?? null,
      name: service?.name ?? null,
    },
    inventory: buildInventorySnapshot(list),
    signals: buildSignalsList(list),
    openapi,
    attestation: evidenceAttestationNote(),
  };

  const risk = await loadRiskModule();
  if (risk && typeof risk.scoreServicePosture === 'function') {
    pack.posture = risk.scoreServicePosture(list);
  }

  return pack;
}
