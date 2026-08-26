# @apiglimpse/nestjs

NestJS module that sends API traffic metadata to API Glimpse (`collect.apiglimpse.com`).

**This package does not reimplement capture.** It mounts:

- **Express adapter (Nest default)** → [`@apiglimpse/middleware`](../middleware)
- **Fastify adapter** → [`@apiglimpse/fastify`](../fastify)

Sampling never blocks your app: if the collector is down, samples are dropped and Nest keeps serving traffic.

## Install

```bash
npm install @apiglimpse/nestjs
```

Peer dependencies: `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs`.

| Nest HTTP adapter | Also ensure |
| --- | --- |
| Express (default) | `@nestjs/platform-express` (usually already present) |
| Fastify | `@nestjs/platform-fastify` |

`@apiglimpse/middleware` and `@apiglimpse/fastify` are installed as dependencies of this package.

## Quick start (Express adapter)

```ts
import { Module } from '@nestjs/common';
import { ApiGlimpseModule } from '@apiglimpse/nestjs';

@Module({
  imports: [
    ApiGlimpseModule.forRoot({
      agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
      apiKey: process.env.API_SENSOR_KEY,
      sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
      serviceName: process.env.API_SENSOR_SERVICE_NAME,
    }),
  ],
})
export class AppModule {}
```

Environment (optional — also used as defaults):

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_...
API_SENSOR_SAMPLE_RATE=1
API_SENSOR_SERVICE_NAME=my-nest-service
```

## Fastify adapter

When Nest uses `FastifyAdapter`, `ApiGlimpseModule.forRoot()` registers the Fastify plugin on init. You can also register explicitly in `main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { registerApiGlimpse } from '@apiglimpse/nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await registerApiGlimpse(app, {
    agentUrl: process.env.API_SENSOR_AGENT_URL,
    apiKey: process.env.API_SENSOR_KEY,
  });

  await app.listen(3000, '0.0.0.0');
}
bootstrap();
```

If you use `registerApiGlimpse` **and** `ApiGlimpseModule.forRoot`, registration is idempotent (only one sensor mounts).

## Manual wiring

```ts
import { expressApiSensor, fastifyApiSensor } from '@apiglimpse/nestjs';
```

Full customer guide: [docs/INTEGRATING.md](../../docs/INTEGRATING.md) · public docs: [docs.apiglimpse.com](https://docs.apiglimpse.com).

## Dependency note

In this monorepo, `package.json` uses `file:../middleware` and `file:../fastify` for local development. Publishing uses `scripts/publish.mjs`, which temporarily points those at registry versions, publishes, then restores the `file:` deps.

## Maintainer publish

Publish `@apiglimpse/shared`, then `@apiglimpse/middleware` and `@apiglimpse/fastify`, then:

```bash
cd packages/nestjs
npm run build
npm run publish:npm
```

- npm account / org detail: [docs/NPM_PUBLISH.md](../../docs/NPM_PUBLISH.md)
- All languages: [docs/CONNECTOR_PUBLISH.md](../../docs/CONNECTOR_PUBLISH.md)
