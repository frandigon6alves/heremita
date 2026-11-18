import {
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  SetMetadata,
  applyDecorators,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import type { EndpointDef, HttpMethod } from '@heremita/shared';
import { THROTTLES } from './throttles.js';

/** Metadata key holding the `EndpointDef` of a route handler. */
export const ENDPOINT = Symbol('ENDPOINT');

const ROUTE_DECORATORS: Record<HttpMethod, (path: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PUT: Put,
  PATCH: Patch,
  DELETE: Delete,
};

/** `/trips/{tripId}/plan` → `trips/:tripId/plan` (Nest path, relative to the global prefix). */
export function routePath(path: EndpointDef['path']): string {
  return path.slice(1).replaceAll(/\{(\w+)\}/g, ':$1');
}

/**
 * Binds a handler to its row of the shared endpoint table: route, success
 * status, throttle, and the metadata `ContractInterceptor` validates against.
 * Every API route handler carries it (route-table test).
 */
export function Endpoint(def: EndpointDef): MethodDecorator {
  const decorators = [
    ROUTE_DECORATORS[def.method](routePath(def.path)),
    HttpCode(def.status),
    SetMetadata(ENDPOINT, def),
  ];
  if (def.throttle) {
    decorators.push(Throttle({ default: THROTTLES[def.throttle] }));
  }
  return applyDecorators(...decorators);
}

/** The endpoint definition of the handler about to run, if it has one. */
export function endpointOf(
  reflector: Reflector,
  context: ExecutionContext,
): EndpointDef | undefined {
  return reflector.get<EndpointDef | undefined>(ENDPOINT, context.getHandler());
}
