export {
  API_GLIMPSE_OPTIONS,
  resolveOptions,
  type ApiGlimpseOptions,
} from './options.js';
export { ApiGlimpseMiddleware } from './middleware.js';
export { ApiGlimpseModule } from './module.js';
export { registerApiGlimpse } from './register.js';

/** Re-export Express sensor for advanced / manual wiring. */
export { apiSensor as expressApiSensor } from '@apiglimpse/middleware';
/** Re-export Fastify sensor for advanced / manual wiring. */
export { apiSensor as fastifyApiSensor } from '@apiglimpse/fastify';
