/**
 * Options for API Glimpse Nest integration.
 * Passed through to `@apiglimpse/middleware` (Express) or `@apiglimpse/fastify`.
 */
export interface ApiGlimpseOptions {
  /** Collector base URL (default: API_SENSOR_AGENT_URL or http://localhost:8080). */
  agentUrl?: string;
  /** Ingest API key (default: API_SENSOR_KEY). */
  apiKey?: string;
  /** 0–1 sample rate (default: API_SENSOR_SAMPLE_RATE or 1). */
  sampleRate?: number;
  /** Explicit caller / service name for topology (SF3). */
  serviceName?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxBufferSize?: number;
  requestTimeoutMs?: number;
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
  policyRefreshMs?: number;
  /** Optional static protect override (tests). */
  protect?: {
    enabled?: boolean;
    mode?: string;
    rule?: string | null;
    version?: number;
    rules?: object[];
  };
}

export const API_GLIMPSE_OPTIONS = 'API_GLIMPSE_OPTIONS';

export function resolveOptions(options: ApiGlimpseOptions = {}): ApiGlimpseOptions {
  const {
    agentUrl = process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080',
    apiKey = process.env.API_SENSOR_KEY || '',
    sampleRate = process.env.API_SENSOR_SAMPLE_RATE != null
      ? Number(process.env.API_SENSOR_SAMPLE_RATE)
      : 1,
    serviceName = process.env.API_SENSOR_SERVICE_NAME || '',
    ...rest
  } = options;

  return {
    ...rest,
    agentUrl,
    apiKey,
    sampleRate,
    serviceName,
  };
}
