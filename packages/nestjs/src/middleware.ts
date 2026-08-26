import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { apiSensor } from '@apiglimpse/middleware';
import type { NextFunction, Request, Response } from 'express';
import { API_GLIMPSE_OPTIONS, type ApiGlimpseOptions } from './options.js';

/**
 * Nest middleware that delegates to `@apiglimpse/middleware` (Express).
 * Used by {@link ApiGlimpseModule} on the default Express adapter.
 */
@Injectable()
export class ApiGlimpseMiddleware implements NestMiddleware {
  private readonly handler: ReturnType<typeof apiSensor>;

  constructor(@Inject(API_GLIMPSE_OPTIONS) options: ApiGlimpseOptions) {
    this.handler = apiSensor(options);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
