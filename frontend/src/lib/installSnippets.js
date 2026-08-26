/**
 * Install snippets for dashboard service settings.
 * Keep in sync with docs/INTEGRATING.md and docs-site/docs/integrating.md.
 */

export const INSTALL_STACKS = [
  { id: 'express', label: 'Express', packageName: '@apiglimpse/middleware' },
  { id: 'fastify', label: 'Fastify', packageName: '@apiglimpse/fastify' },
  { id: 'nestjs', label: 'NestJS', packageName: '@apiglimpse/nestjs' },
  { id: 'next', label: 'Next.js', packageName: '@apiglimpse/next' },
  { id: 'fastapi', label: 'FastAPI', packageName: 'apiglimpse' },
  { id: 'django', label: 'Django', packageName: 'apiglimpse[django]' },
  { id: 'flask', label: 'Flask', packageName: 'apiglimpse[flask]' },
  { id: 'go', label: 'Go (chi)', packageName: 'apiglimpse (Go module)' },
  { id: 'spring', label: 'Spring Boot', packageName: 'apiglimpse-spring-boot-starter' },
  { id: 'aspnet', label: 'ASP.NET Core', packageName: 'ApiGlimpse.AspNetCore' },
  { id: 'nginx', label: 'Nginx (OpenResty)', packageName: 'connectors/nginx' },
  { id: 'kong', label: 'Kong', packageName: 'kong-plugin-apiglimpse' },
  { id: 'gateway-proxy', label: 'Node gateway sidecar', packageName: '@apiglimpse/gateway-proxy' },
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

    case 'nestjs':
      return `# .env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# app.module.ts
import { Module } from '@nestjs/common';
import { ApiGlimpseModule } from '@apiglimpse/nestjs';

@Module({
  imports: [
    ApiGlimpseModule.forRoot({
      agentUrl: process.env.API_SENSOR_AGENT_URL,
      apiKey: process.env.API_SENSOR_KEY,
      serviceName: process.env.API_SENSOR_SERVICE_NAME,
    }),
  ],
})
export class AppModule {}`;

    case 'next':
      return `# .env.local
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# app/api/users/route.js
import { withApiSensor } from '@apiglimpse/next';

export const GET = withApiSensor(async () => Response.json({ users: [] }));
export const POST = withApiSensor(async (request) => {
  const body = await request.json();
  return Response.json({ ok: true }, { status: 201 });
});`;

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

    case 'django':
      return `# .env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# settings.py
MIDDLEWARE = [
    "apiglimpse.django.ApiGlimpseDjangoMiddleware",
    # ...
]`;

    case 'flask':
      return `# .env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# app.py
from flask import Flask
from apiglimpse.flask import ApiGlimpse

app = Flask(__name__)
ApiGlimpse(app)`;

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

    case 'spring':
      return `# application.properties
apiglimpse.agent-url=${agent}
apiglimpse.api-key=${key}
apiglimpse.service-name=${svc}

# pom.xml dependency: com.apiglimpse:apiglimpse-spring-boot-starter:0.1.0
# (./mvnw install from connectors/java until Maven Central publish)`;

    case 'aspnet':
      return `// appsettings.json / env
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

// Program.cs
builder.Services.AddApiGlimpse(builder.Configuration);
app.UseApiGlimpse();`;

    case 'nginx':
      return `# env (OpenResty)
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

# See docs/GATEWAY_NGINX.md — copy connectors/nginx/*.lua
# init_worker_by_lua + log_by_lua`;

    case 'kong':
      return `# Kong Admin API
curl -X POST http://localhost:8001/plugins \\
  --data "name=apiglimpse" \\
  --data "config.agent_url=${agent}" \\
  --data "config.api_key=${key}" \\
  --data "config.service_name=${svc}"

# See docs/GATEWAY_KONG.md`;

    case 'gateway-proxy':
      return `# Run in front of your app (no app SDK)
API_SENSOR_UPSTREAM=http://127.0.0.1:3000
API_SENSOR_AGENT_URL=${agent}
API_SENSOR_KEY=${key}
API_SENSOR_SERVICE_NAME=${svc}

cd packages/gateway-proxy && npm start
# Point clients at the proxy (default :9080)`;

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
