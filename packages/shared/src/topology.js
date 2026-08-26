/**
 * SF9 — topology baseline validation and compare helpers.
 * @see docs/TOPOLOGY_BASELINE.md
 */

export const TOPOLOGY_BASELINE_VERSION = 1;
export const TOPOLOGY_DRIFT_VERSION = 1;

const SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/;
const TIERS = new Set(['public', 'private', 'internal']);

/**
 * @param {unknown} baseline
 * @returns {{ ok: true, baseline: object } | { ok: false, errors: string[] }}
 */
export function validateTopologyBaseline(baseline) {
  const errors = [];
  if (!baseline || typeof baseline !== 'object') {
    return { ok: false, errors: ['baseline must be an object'] };
  }

  const version = baseline.version;
  if (version !== TOPOLOGY_BASELINE_VERSION) {
    errors.push(`version must be ${TOPOLOGY_BASELINE_VERSION}`);
  }

  const nodes = baseline.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push('nodes must be a non-empty array');
  }

  const nodeIds = new Set();
  for (const [i, node] of (nodes || []).entries()) {
    if (!node || typeof node !== 'object') {
      errors.push(`nodes[${i}] must be an object`);
      continue;
    }
    const id = String(node.id || '').trim();
    if (!SLUG_RE.test(id)) {
      errors.push(`nodes[${i}].id must match ${SLUG_RE}`);
    }
    if (nodeIds.has(id)) {
      errors.push(`duplicate node id: ${id}`);
    }
    nodeIds.add(id);
    if (node.tier != null && !TIERS.has(node.tier)) {
      errors.push(`nodes[${i}].tier must be public|private|internal`);
    }
  }

  const edges = baseline.edges;
  if (edges != null && !Array.isArray(edges)) {
    errors.push('edges must be an array');
  }

  const edgeKeys = new Set();
  for (const [i, edge] of (edges || []).entries()) {
    if (!edge || typeof edge !== 'object') {
      errors.push(`edges[${i}] must be an object`);
      continue;
    }
    const from = String(edge.from || '').trim();
    const to = String(edge.to || '').trim();
    if (!nodeIds.has(from)) errors.push(`edges[${i}].from unknown node: ${from}`);
    if (!nodeIds.has(to)) errors.push(`edges[${i}].to unknown node: ${to}`);
    if (from === to) errors.push(`edges[${i}] from and to must differ`);
    const key = `${from}|${to}`;
    if (edgeKeys.has(key)) errors.push(`duplicate edge: ${from} → ${to}`);
    edgeKeys.add(key);
  }

  const externalCallers = baseline.externalCallers;
  if (externalCallers != null && !Array.isArray(externalCallers)) {
    errors.push('externalCallers must be an array');
  }

  const callerIds = new Set();
  for (const [i, caller] of (externalCallers || []).entries()) {
    if (!caller || typeof caller !== 'object') {
      errors.push(`externalCallers[${i}] must be an object`);
      continue;
    }
    const id = String(caller.id || '').trim();
    if (!SLUG_RE.test(id)) {
      errors.push(`externalCallers[${i}].id must match slug pattern`);
    }
    if (callerIds.has(id)) errors.push(`duplicate external caller id: ${id}`);
    callerIds.add(id);
    for (const target of caller.targets || []) {
      if (!nodeIds.has(String(target))) {
        errors.push(`externalCallers[${i}] unknown target: ${target}`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    baseline: normalizeTopologyBaseline(baseline),
  };
}

/**
 * @param {object} raw
 */
export function normalizeTopologyBaseline(raw) {
  const nodes = (raw.nodes || []).map((n) => ({
    id: String(n.id).trim(),
    label: String(n.label || n.id).trim(),
    tier: n.tier && TIERS.has(n.tier) ? n.tier : 'private',
    instrumented: n.instrumented !== false,
  }));

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const publicIds = nodes.filter((n) => n.tier === 'public').map((n) => n.id);

  const edges = (raw.edges || []).map((e, idx) => ({
    id: String(e.id || `${e.from}-to-${e.to}` || `edge-${idx}`).trim(),
    from: String(e.from).trim(),
    to: String(e.to).trim(),
    label: e.label ? String(e.label) : undefined,
  }));

  const externalCallers = (raw.externalCallers || []).map((c) => ({
    id: String(c.id).trim(),
    label: String(c.label || c.id).trim(),
    targets: (c.targets?.length ? c.targets : publicIds).map((t) => String(t).trim()),
  }));

  return {
    version: TOPOLOGY_BASELINE_VERSION,
    metadata: {
      name: raw.metadata?.name ? String(raw.metadata.name) : undefined,
      description: raw.metadata?.description ? String(raw.metadata.description) : undefined,
      updatedAt: raw.metadata?.updatedAt || new Date().toISOString(),
    },
    nodes,
    edges,
    externalCallers,
    _nodeById: nodeById,
  };
}

/**
 * Build observed service-to-service edges from TrafficEdge rows.
 * @param {{ id: string, name: string, trafficEdges: object[] }[]} services
 */
export function buildObservedGraph(services) {
  /** @type {Map<string, { from: string, to: string, hitCount: number, lastSeenAt: string, samples: object[], callerKey?: string }>} */
  const internalEdges = new Map();
  /** @type {Map<string, { callerId: string, label: string, to: string, hitCount: number, lastSeenAt: string, callerKey: string }>} */
  const externalCallers = new Map();

  const serviceNames = new Set(services.map((s) => s.name));

  for (const service of services) {
    const target = service.name;
    for (const edge of service.trafficEdges || []) {
      const callerKey = String(edge.callerKey || '').trim();
      const callerLabel = String(edge.callerLabel || callerKey).trim();
      const hitInc = Number(edge.hitCount) || 0;
      const lastSeenAt = edge.lastSeenAt
        ? new Date(edge.lastSeenAt).toISOString()
        : new Date().toISOString();
      const sample = { method: edge.method, pathTemplate: edge.pathTemplate };

      if (callerKey.startsWith('svc:')) {
        const from = callerKey.slice(4);
        const key = `${from}|${target}`;
        const prev = internalEdges.get(key) || {
          from,
          to: target,
          hitCount: 0,
          lastSeenAt,
          samples: [],
        };
        prev.hitCount += hitInc;
        if (lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = lastSeenAt;
        if (prev.samples.length < 3) prev.samples.push(sample);
        internalEdges.set(key, prev);
      } else if (callerLabel) {
        const callerId = callerLabel;
        const key = `${callerId}|${target}`;
        const prev = externalCallers.get(key) || {
          callerId,
          label: callerLabel,
          to: target,
          hitCount: 0,
          lastSeenAt,
          callerKey,
        };
        prev.hitCount += hitInc;
        if (lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = lastSeenAt;
        externalCallers.set(key, prev);
      }
    }
  }

  const nodes = [...serviceNames].sort().map((name) => ({
    id: name,
    label: name,
    instrumented: true,
  }));

  return {
    version: TOPOLOGY_BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    nodes,
    edges: [...internalEdges.values()].sort((a, b) => a.from.localeCompare(b.from)),
    externalCallers: [...externalCallers.values()].sort((a, b) =>
      a.callerId.localeCompare(b.callerId),
    ),
  };
}

/**
 * Compare baseline vs observed graphs.
 * @param {object} baseline normalized baseline
 * @param {object} observed from buildObservedGraph
 */
export function compareTopology(baseline, observed) {
  const nodeById = baseline._nodeById || new Map(baseline.nodes.map((n) => [n.id, n]));

  const baselineEdgeKeys = new Set(baseline.edges.map((e) => `${e.from}|${e.to}`));

  const baselineCallers = new Map();
  for (const c of baseline.externalCallers || []) {
    for (const target of c.targets) {
      baselineCallers.set(`${c.id}|${target}`, c);
    }
  }

  /** @type {object[]} */
  const edges = [];

  for (const be of baseline.edges) {
    const key = `${be.from}|${be.to}`;
    const obs = observed.edges.find((e) => `${e.from}|${e.to}` === key);
    const status = obs && obs.hitCount > 0 ? 'matched' : 'missing';
    edges.push({
      from: be.from,
      to: be.to,
      status,
      baselineEdgeId: be.id,
      label: be.label,
      observedHitCount: obs?.hitCount || 0,
      lastSeenAt: obs?.lastSeenAt,
      samples: obs?.samples || [],
      severity: driftSeverity(status, nodeById.get(be.to)),
    });
  }

  for (const oe of observed.edges) {
    const key = `${oe.from}|${oe.to}`;
    if (baselineEdgeKeys.has(key)) continue;
    // External callers often appear as svc:<id> edges — not shadow service edges
    if (baselineCallers.has(key)) continue;
    edges.push({
      from: oe.from,
      to: oe.to,
      status: 'shadow',
      observedHitCount: oe.hitCount,
      lastSeenAt: oe.lastSeenAt,
      samples: oe.samples || [],
      severity: driftSeverity('shadow', nodeById.get(oe.to)),
    });
  }

  /** @type {object[]} */
  const externalCallerResults = [];

  /** Match baseline external callers against svc: edges or external caller rows */
  function findObservedCaller(callerId, target) {
    const svcEdge = observed.edges.find((e) => e.from === callerId && e.to === target);
    if (svcEdge) return { hitCount: svcEdge.hitCount, via: 'edge' };
    const ext = observed.externalCallers.find(
      (c) => c.callerId === callerId && c.to === target,
    );
    if (ext) return { hitCount: ext.hitCount, via: 'external' };
    return null;
  }

  for (const [key, bc] of baselineCallers) {
    const target = key.split('|')[1];
    const obs = findObservedCaller(bc.id, target);
    externalCallerResults.push({
      callerId: bc.id,
      label: bc.label,
      to: target,
      status: obs && obs.hitCount > 0 ? 'matched' : 'missing',
      observedHitCount: obs?.hitCount || 0,
      severity: 'medium',
    });
  }

  for (const oc of observed.externalCallers) {
    const key = `${oc.callerId}|${oc.to}`;
    if (baselineCallers.has(key)) continue;
    externalCallerResults.push({
      callerId: oc.callerId,
      label: oc.label,
      to: oc.to,
      status: 'shadow',
      observedHitCount: oc.hitCount,
      callerKey: oc.callerKey,
      severity: 'medium',
    });
  }

  const summary = {
    matched: edges.filter((e) => e.status === 'matched').length,
    missing: edges.filter((e) => e.status === 'missing').length,
    shadow: edges.filter((e) => e.status === 'shadow').length,
    externalMatched: externalCallerResults.filter((c) => c.status === 'matched').length,
    externalMissing: externalCallerResults.filter((c) => c.status === 'missing').length,
    externalShadow: externalCallerResults.filter((c) => c.status === 'shadow').length,
  };

  return {
    version: TOPOLOGY_BASELINE_VERSION,
    comparedAt: new Date().toISOString(),
    summary,
    edges,
    externalCallers: externalCallerResults,
  };
}

/**
 * @param {'missing'|'shadow'|'matched'} status
 * @param {{ tier?: string }|undefined} targetNode
 */
export function driftSeverity(status, targetNode) {
  const tier = targetNode?.tier || 'private';
  if (status === 'matched') return 'info';
  if (status === 'missing') {
    if (tier === 'internal') return 'high';
    if (tier === 'private') return 'medium';
    return 'low';
  }
  if (status === 'shadow') {
    if (tier === 'internal') return 'high';
    return 'medium';
  }
  return 'info';
}

/**
 * Build drift event records from a compare result (new items only).
 * @param {object} compare
 * @param {Set<string>} existingDriftKeys
 */
export function driftEventsFromCompare(compare, existingDriftKeys = new Set()) {
  /** @type {object[]} */
  const events = [];

  for (const edge of compare.edges) {
    if (edge.status === 'matched') continue;
    const driftKey =
      edge.status === 'missing'
        ? `edge:missing:${edge.from}:${edge.to}`
        : `edge:shadow:${edge.from}:${edge.to}`;
    if (existingDriftKeys.has(driftKey)) continue;

    const type = edge.status === 'missing' ? 'topology.edge.missing' : 'topology.edge.shadow';
    events.push({
      type,
      driftKey,
      payload: {
        version: TOPOLOGY_DRIFT_VERSION,
        from: edge.from,
        to: edge.to,
        baselineEdgeId: edge.baselineEdgeId,
        status: edge.status,
        observedHitCount: edge.observedHitCount,
        severity: edge.severity,
        message:
          edge.status === 'missing'
            ? `Documented edge ${edge.from} → ${edge.to} not seen in traffic`
            : `Undocumented edge ${edge.from} → ${edge.to} observed in traffic`,
        samples: edge.samples,
      },
    });
  }

  for (const caller of compare.externalCallers) {
    if (caller.status === 'matched') continue;
    const driftKey =
      caller.status === 'missing'
        ? `caller:missing:${caller.callerId}:${caller.to}`
        : `caller:shadow:${caller.callerId}:${caller.to}`;
    if (existingDriftKeys.has(driftKey)) continue;

    const type =
      caller.status === 'missing' ? 'topology.caller.missing' : 'topology.caller.shadow';
    events.push({
      type,
      driftKey,
      payload: {
        version: TOPOLOGY_DRIFT_VERSION,
        callerId: caller.callerId,
        to: caller.to,
        status: caller.status,
        observedHitCount: caller.observedHitCount,
        severity: caller.severity,
        message:
          caller.status === 'missing'
            ? `Expected caller ${caller.callerId} → ${caller.to} not seen`
            : `Unexpected caller ${caller.callerId} → ${caller.to} observed`,
      },
    });
  }

  return events;
}
