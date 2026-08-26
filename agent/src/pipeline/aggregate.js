import { normalizePath, endpointKey } from './normalize.js';
import { inferSchemaFromShape, mergeSchemas } from './schema.js';
import { detectSensitiveFields, detectAuthSignals } from './heuristics.js';
import { callerEdgeKey, callerDisplayName } from '@apiglimpse/shared';

/**
 * In-memory aggregation of samples into inventory deltas + caller edges.
 * Raw samples are never persisted — only derived inventory / topology.
 */
export class InventoryAggregator {
  constructor() {
    /** @type {Map<string, object>} */
    this.endpoints = new Map();
    /** @type {Map<string, object>} */
    this.edges = new Map();
  }

  /**
   * @param {object} sample
   */
  ingestSample(sample) {
    const method = String(sample.method || 'GET').toUpperCase();
    const pathTemplate = normalizePath(sample.path);
    const key = endpointKey(method, pathTemplate);

    let ep = this.endpoints.get(key);
    if (!ep) {
      ep = {
        method,
        pathTemplate,
        hitCount: 0,
        authModes: new Set(),
        statusCodes: {},
        contentTypes: new Set(),
        requestSchema: null,
        responseSchema: null,
        signals: [],
        firstSeenAt: sample.timestamp || new Date().toISOString(),
        lastSeenAt: sample.timestamp || new Date().toISOString(),
      };
      this.endpoints.set(key, ep);
    }

    ep.hitCount += 1;
    ep.lastSeenAt = sample.timestamp || new Date().toISOString();

    const status = String(sample.statusCode || 0);
    ep.statusCodes[status] = (ep.statusCodes[status] || 0) + 1;

    if (sample.authObserved) {
      ep.authModes.add(sample.authObserved);
    }

    if (sample.request?.contentType) {
      ep.contentTypes.add(sample.request.contentType);
    }
    if (sample.response?.contentType) {
      ep.contentTypes.add(sample.response.contentType);
    }

    if (sample.request?.bodyShape) {
      const inferred = inferSchemaFromShape(sample.request.bodyShape);
      ep.requestSchema = mergeSchemas([ep.requestSchema, inferred].filter(Boolean));
      ep.signals.push(...detectSensitiveFields(sample.request.bodyShape, 'request.body'));
    }

    if (sample.response?.bodyShape) {
      const inferred = inferSchemaFromShape(sample.response.bodyShape);
      ep.responseSchema = mergeSchemas([ep.responseSchema, inferred].filter(Boolean));
      ep.signals.push(...detectSensitiveFields(sample.response.bodyShape, 'response.body'));
    }

    ep.signals.push(...detectAuthSignals(sample));
    ep.signals = dedupe(ep.signals);

    this.ingestCallerEdge(sample, method, pathTemplate);
  }

  /**
   * Aggregate caller → (method, pathTemplate) edge counts.
   */
  ingestCallerEdge(sample, method, pathTemplate) {
    const caller = sample.caller || {};
    const edgeCallerKey = callerEdgeKey(caller);
    const edgeKey = `${edgeCallerKey}|${method}|${pathTemplate}`;
    const ts = sample.timestamp || new Date().toISOString();

    let edge = this.edges.get(edgeKey);
    if (!edge) {
      edge = {
        callerKey: edgeCallerKey,
        callerName: callerDisplayName(caller),
        callerSource: caller.source || null,
        uaFamily: caller.uaFamily || 'unknown',
        method,
        pathTemplate,
        hitCount: 0,
        firstSeenAt: ts,
        lastSeenAt: ts,
      };
      this.edges.set(edgeKey, edge);
    }

    edge.hitCount += 1;
    edge.lastSeenAt = ts;
    if (caller.name) {
      edge.callerName = String(caller.name).slice(0, 128);
    }
    if (caller.source) {
      edge.callerSource = caller.source;
    }
  }

  /**
   * Drain aggregated deltas for upsert. Clears the maps.
   * @returns {{ endpoints: object[], edges: object[] }}
   */
  drain() {
    const endpoints = [];
    for (const ep of this.endpoints.values()) {
      endpoints.push({
        method: ep.method,
        pathTemplate: ep.pathTemplate,
        hitCount: ep.hitCount,
        authModes: [...ep.authModes],
        statusCodes: ep.statusCodes,
        contentTypes: [...ep.contentTypes],
        requestSchema: ep.requestSchema,
        responseSchema: ep.responseSchema,
        signals: ep.signals,
        firstSeenAt: ep.firstSeenAt,
        lastSeenAt: ep.lastSeenAt,
      });
    }
    this.endpoints.clear();

    const edges = [];
    for (const edge of this.edges.values()) {
      edges.push({ ...edge });
    }
    this.edges.clear();

    return { endpoints, edges };
  }
}

function dedupe(signals) {
  const seen = new Set();
  const out = [];
  for (const s of signals) {
    const key = `${s.type}|${s.fieldPath}|${s.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
