import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ApiRequest, ContractInput } from './api-request.js';

/**
 * The validated request (`EndpointInput<typeof endpoints.x>`): params, query and
 * body after `ContractInterceptor` parsed them with the endpoint's schemas.
 */
export const Input = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ContractInput =>
    context.switchToHttp().getRequest<ApiRequest>().contract ?? {},
);
