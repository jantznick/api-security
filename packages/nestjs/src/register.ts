import { apiSensor as expressApiSensor } from '@apiglimpse/middleware';
import { apiSensor as fastifyApiSensor } from '@apiglimpse/fastify';
import type { INestApplication } from '@nestjs/common';
import { resolveOptions, type ApiGlimpseOptions } from './options.js';

const kRegistered = Symbol.for('apiglimpse.nestjs.registered');

type HttpAdapterLike = {
  getType?: () => string;
  getInstance?: () => unknown;
};

/**
 * Register API Glimpse on a Nest application for either adapter.
 *
 * - **Express** (default): mounts `@apiglimpse/middleware` on the Express instance.
 * - **Fastify**: registers `@apiglimpse/fastify` on the Fastify instance.
 *
 * Prefer this helper for Fastify Nest apps (call after `NestFactory.create`,
 * before `listen`). Express apps can use {@link ApiGlimpseModule.forRoot} instead.
 */
export async function registerApiGlimpse(
  app: INestApplication,
  options: ApiGlimpseOptions = {},
): Promise<void> {
  const cfg = resolveOptions(options);
  const adapter = app.getHttpAdapter?.() as HttpAdapterLike | undefined;
  const type = adapter?.getType?.() || 'express';
  const instance = adapter?.getInstance?.() as
    | (Record<PropertyKey, unknown> & {
        use?: (...args: unknown[]) => unknown;
        register?: (...args: unknown[]) => Promise<unknown> | unknown;
      })
    | undefined;

  if (!instance) {
    throw new Error(
      'registerApiGlimpse: could not get HTTP adapter instance from Nest app',
    );
  }

  if (instance[kRegistered]) {
    return;
  }

  if (type === 'fastify') {
    if (typeof instance.register !== 'function') {
      throw new Error(
        'registerApiGlimpse: Fastify adapter instance has no register()',
      );
    }
    await instance.register(fastifyApiSensor(cfg));
  } else {
    if (typeof instance.use !== 'function') {
      throw new Error(
        'registerApiGlimpse: Express adapter instance has no use()',
      );
    }
    instance.use(expressApiSensor(cfg));
  }

  instance[kRegistered] = true;
}
