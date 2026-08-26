export {
  ENVELOPE_VERSION,
  SENSITIVE_HEADER_NAMES,
  redactHeaders,
  redactValue,
  shapeBody,
  truncateString,
} from './redaction.js';

export {
  classifyUserAgent,
  resolveCallerHints,
  callerEdgeKey,
  callerDisplayName,
} from './caller.js';

export { createSample, createEnvelope, validateEnvelope } from './envelope.js';

export {
  TOPOLOGY_BASELINE_VERSION,
  TOPOLOGY_DRIFT_VERSION,
  validateTopologyBaseline,
  normalizeTopologyBaseline,
  buildObservedGraph,
  compareTopology,
  driftSeverity,
  driftEventsFromCompare,
} from './topology.js';
