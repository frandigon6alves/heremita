import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX, LIMITS } from '@heremita/shared';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { ProblemDetailsFilter } from './core/http/problem-details.filter.js';

/** API responses are per-user and never cached unless an endpoint says otherwise. */
function noStoreByDefault(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * HTTP configuration shared by the real server (main.ts) and the HTTP-level
 * tests, so that tests exercise the same routes and pipeline as production.
 * Call it before `init()`/`listen()`: the JSON parser registered here replaces
 * Nest's default one.
 */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(noStoreByDefault);
  app.useBodyParser('json', { limit: LIMITS.BODY_MAX_BYTES });
  app.useGlobalFilters(new ProblemDetailsFilter());
}
