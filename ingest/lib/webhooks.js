/**
 * Thin re-export so ingest can notify without depending on @prisma from backend.
 * Implementation lives in backend/lib/webhooks.js (no Node/backend-only deps).
 */
export {
  isHighSeverity,
  notifyHighSeveritySignal,
  resolveIntegrationUrls,
} from '../../backend/lib/webhooks.js';
