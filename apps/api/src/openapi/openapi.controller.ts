import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Controller } from '@nestjs/common';
import { endpoints } from '@heremita/shared';
import { Endpoint } from '../core/http/endpoint.decorator.js';

const require = createRequire(import.meta.url);

/** The committed, generated document (drift-tested in `@heremita/shared`), read once at boot. */
const OPENAPI_DOCUMENT: unknown = JSON.parse(
  readFileSync(require.resolve('@heremita/shared/openapi.json'), 'utf8'),
);

@Controller()
export class OpenApiController {
  /** E3: the OpenAPI 3.1 description of this API. */
  @Endpoint(endpoints.getOpenApi)
  getOpenApi(): unknown {
    return OPENAPI_DOCUMENT;
  }
}
