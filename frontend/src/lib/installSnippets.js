/**
 * Install snippets for dashboard service settings.
 * Keep in sync with docs/INTEGRATING.md and docs-site/docs/integrating.md.
 */

export const INSTALL_STACKS = [
  { id: 'express', label: 'Express', packageName: '@apiglimpse/middleware' },
  { id: 'fastify', label: 'Fastify', packageName: '@apiglimpse/fastify' },
  { id: 'fastapi', label: 'FastAPI', packageName: 'apiglimpse' },
  { id: 'go', label: 'Go (chi)', packageName: 'apiglimpse (Go module)' },
];

/**
 * @param {string} stackId
 * @param {{ collectUrl: string, apiKey?: string | null, serviceName?: string | null }} opts
 */
export function buildInstallSnippet(stackId, { collectUrl, apiKey, serviceName }) {
  const key = apiKey || 'ask_your_key_here';
  const agent = collectUrl || 'https://collect.apiglimpse.com';
  const svc = serviceName || 'my-service';

  switch (stackId) {
    case 'fastify':
      return `# .env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
# Optional but recommended for caller topology:
API_SENSOR_SERVICE_NAME=${svc}

# server.js
import Fastify from 'fastify';
import { apiSensor } from '@apiglimpse/fastify';

const app = Fastify();
await app.register(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL,
    apiKey: process.env.API_SENSOR_KEY,
    serviceName: process.env.API_SENSOR_SERVICE_NAME,
  }),
);`;

    case 'fastapi':
      return `# .env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# main.py
from fastapi import FastAPI
from apiglimpse import ApiGlimpseMiddleware

app = FastAPI()
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url="${agent}",
    api_key="${key}",
    service_name="${svc}",
)`;

    case 'go':
      return `# env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# after: go get github.com/jantznick/api-security/connectors/go/apiglimpse@v0.1.0
r := chi.NewRouter()
r.Use(apiglimpse.Middleware(apiglimpse.Config{
  AgentURL:    os.Getenv("API_SENSOR_AGENT_URL"),
  APIKey:      os.Getenv("API_SENSOR_KEY"),
  ServiceName: os.Getenv("API_SENSOR_SERVICE_NAME"),
}))`;

    case 'express':
    default:
      return `# .env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
# Optional but recommended for caller topology:
API_SENSOR_SERVICE_NAME=${svc}

# app.js
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();
app.use(express.json());
app.use(apiSensor({
  agentUrl: process.env.API_SENSOR_AGENT_URL,
  apiKey: process.env.API_SENSOR_KEY,
  serviceName: process.env.API_SENSOR_SERVICE_NAME,
}));`;
  }
}
