import { createApiSensor } from '@apiglimpse/next';

/**
 * Shared sensor for demo Route Handlers.
 * Env: API_SENSOR_AGENT_URL, API_SENSOR_KEY, API_SENSOR_SAMPLE_RATE
 */
export const sensor = createApiSensor({
  agentUrl: process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080',
  apiKey: process.env.API_SENSOR_KEY || '',
  sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
  serviceName: 'demo-next-app',
});

export const users = [
  { id: 1, email: 'alice@example.com', name: 'Alice', phone: '555-0100' },
  { id: 2, email: 'bob@example.com', name: 'Bob', phone: '555-0101' },
];
