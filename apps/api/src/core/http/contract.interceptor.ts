import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { ApiRequest } from './api-request.js';
import { parseInput, parseOutput } from './contract.js';
import { endpointOf } from './endpoint.decorator.js';

/**
 * Validates every request against its endpoint's schemas before the handler
 * runs (`@Input()` reads the result: Express 5's `req.query` cannot be
 * rewritten) and passes the handler's result through the response schema.
 */
@Injectable()
export class ContractInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const def = endpointOf(this.reflector, context);
    if (!def) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<ApiRequest>();
    request.contract = parseInput(def, {
      params: request.params,
      query: request.query,
      body: request.body as unknown,
    });
    return next.handle().pipe(map((result: unknown) => parseOutput(def, result)));
  }
}
