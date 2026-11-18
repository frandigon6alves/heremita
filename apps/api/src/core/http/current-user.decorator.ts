import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ApiRequest, SessionUser } from './api-request.js';

/**
 * The signed-in caller, or `null` when anonymous. Non-null on `required` and
 * `moderator` endpoints: the session guard answers 401 before the handler runs.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser | null =>
    context.switchToHttp().getRequest<ApiRequest>().user ?? null,
);
