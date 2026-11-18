import type { EndpointDef, ErrorCode, ProblemFieldError } from '@heremita/shared';
import type { z } from 'zod';
import { ApiProblem } from './api-problem.js';
import type { ContractInput } from './api-request.js';

type InputPart = 'query' | 'body';

/** The 404 a malformed path parameter answers: the resource it names was not found. */
const PARAM_NOT_FOUND: Record<string, ErrorCode> = {
  tripId: 'trip_not_found',
  shareToken: 'trip_not_found',
  placeId: 'place_not_found',
  userId: 'user_not_found',
};

/** The 404 code a malformed path parameter of this name answers. */
export function notFoundCodeOf(param: string): ErrorCode {
  return PARAM_NOT_FOUND[param] ?? 'not_found';
}

function escapePointerToken(token: PropertyKey): string {
  return String(token).replaceAll('~', '~0').replaceAll('/', '~1');
}

function pointer(part: InputPart, path: readonly PropertyKey[]): string {
  return ['', part, ...path.map(escapePointerToken)].join('/');
}

/** One field error per invalid input; an unknown key is reported at its own pointer. */
export function fieldErrors(part: InputPart, error: z.ZodError): ProblemFieldError[] {
  return error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({
          pointer: pointer(part, [...issue.path, key]),
          detail: 'Unknown field.',
        }))
      : [{ pointer: pointer(part, issue.path), detail: issue.message }],
  );
}

/**
 * Parses the request parts an endpoint declares. A malformed path parameter
 * answers 404 (the resource cannot exist); invalid query or body answers 422
 * `validation_failed` with one JSON Pointer per problem, query first.
 */
export function parseInput(def: EndpointDef, raw: ContractInput): ContractInput {
  const parsed: ContractInput = {};

  if (def.params) {
    const result = def.params.safeParse(raw.params);
    if (!result.success) {
      const name = String(result.error.issues[0]?.path[0] ?? '');
      throw new ApiProblem(notFoundCodeOf(name), 'No such resource.');
    }
    parsed.params = result.data;
  }

  const errors: ProblemFieldError[] = [];
  for (const part of ['query', 'body'] as const) {
    const schema = def[part];
    if (!schema) {
      continue;
    }
    const result = schema.safeParse(raw[part]);
    if (result.success) {
      parsed[part] = result.data;
    } else {
      errors.push(...fieldErrors(part, result.error));
    }
  }
  if (errors.length > 0) {
    throw new ApiProblem('validation_failed', 'The request has invalid fields.', { errors });
  }
  return parsed;
}

/** Thrown when a handler returns something its endpoint's response schema rejects: always our bug. */
export class ResponseContractError extends Error {
  override readonly name = 'ResponseContractError';
}

/**
 * Passes a handler's result through the endpoint's response schema, which
 * strips every key the contract does not list (output allowlist). Only issue
 * paths go into the error, never values: a response may hold private data.
 */
export function parseOutput(def: EndpointDef, result: unknown): unknown {
  if (!def.response) {
    return undefined;
  }
  const parsed = def.response.safeParse(result);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => `/${issue.path.join('/')}`).join(', ');
    throw new ResponseContractError(
      `Response of ${def.method} ${def.path} breaks its contract at ${paths}`,
    );
  }
  return parsed.data;
}
