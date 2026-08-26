import {
  DynamicModule,
  Global,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { apiSensor as fastifyApiSensor } from '@apiglimpse/fastify';
import { ApiGlimpseMiddleware } from './middleware.js';
import {
  API_GLIMPSE_OPTIONS,
  resolveOptions,
  type ApiGlimpseOptions,
} from './options.js';

const kRegistered = Symbol.for('apiglimpse.nestjs.registered');

/**
 * Nest module that mounts API Glimpse traffic capture.
 *
 * - **Express adapter (default):** applies {@link ApiGlimpseMiddleware}, which
 *   delegates to `@apiglimpse/middleware`.
 * - **Fastify adapter:** registers `@apiglimpse/fastify` on the underlying
 *   Fastify instance during `onModuleInit` (do not reimplement capture).
 *
 * @example Express (typical Nest app)
 * ```ts
 * @Module({
 *   imports: [
 *     ApiGlimpseModule.forRoot({
 *       agentUrl: process.env.API_SENSOR_AGENT_URL,
 *       apiKey: process.env.API_SENSOR_KEY,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class ApiGlimpseModule implements NestModule, OnModuleInit {
  constructor(
    @Inject(API_GLIMPSE_OPTIONS) private readonly options: ApiGlimpseOptions,
    @Optional() private readonly httpAdapterHost?: HttpAdapterHost,
  ) {}

  static forRoot(options: ApiGlimpseOptions = {}): DynamicModule {
    return {
      module: ApiGlimpseModule,
      global: true,
      providers: [
        {
          provide: API_GLIMPSE_OPTIONS,
          useValue: resolveOptions(options),
        },
        ApiGlimpseMiddleware,
      ],
      exports: [API_GLIMPSE_OPTIONS, ApiGlimpseMiddleware],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    const type = this.httpAdapterHost?.httpAdapter?.getType?.();
    // Fastify Nest middleware is preHandler-only; use the Fastify plugin instead.
    if (type === 'fastify') {
      return;
    }
    consumer.apply(ApiGlimpseMiddleware).forRoutes('*');
  }

  async onModuleInit(): Promise<void> {
    const adapter = this.httpAdapterHost?.httpAdapter;
    if (!adapter || adapter.getType?.() !== 'fastify') {
      return;
    }

    const instance = adapter.getInstance() as Record<PropertyKey, unknown> & {
      register?: (plugin: unknown) => Promise<unknown> | unknown;
    };

    if (!instance || typeof instance.register !== 'function') {
      return;
    }
    if (instance[kRegistered]) {
      return;
    }

    await instance.register(fastifyApiSensor(this.options));
    instance[kRegistered] = true;
  }
}
