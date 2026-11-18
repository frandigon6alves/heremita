import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { ERROR_STATUS } from '../error-codes.js';
import { endpoints, implicitErrorCodes, type EndpointDef } from './endpoints.js';

const definitions: [string, EndpointDef][] = Object.entries(endpoints);

const inputParts = definitions.flatMap(([name, def]) =>
  (['params', 'query', 'body'] as const).flatMap((part) => {
    const schema = def[part];
    return schema ? [{ label: `${name}.${part}`, schema }] : [];
  }),
);

const FORBIDDEN_INPUT_KEYS = [
  'id',
  'ownerId',
  'authorId',
  'role',
  'isDemo',
  'planVersion',
  'shareToken',
  'publishedAt',
];

/** A reference to the reported object, not the id of the report being created. */
const ALLOWED_NESTED_KEYS = new Set(['createReport.body.target.id']);

interface WalkableDef {
  type: string;
  shape?: Record<string, z.ZodType>;
  innerType?: z.ZodType;
  in?: z.ZodType;
  options?: z.ZodType[];
  element?: z.ZodType;
}

/** Every key path of an input schema, through wrappers, pipes, unions and arrays. */
function keyPaths(schema: z.ZodType, prefix: string): string[] {
  const def = schema._zod.def as unknown as WalkableDef;
  switch (def.type) {
    case 'object':
      return Object.entries(def.shape ?? {}).flatMap(([key, child]) => [
        `${prefix}.${key}`,
        ...keyPaths(child, `${prefix}.${key}`),
      ]);
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
      return def.innerType ? keyPaths(def.innerType, prefix) : [];
    case 'pipe':
      return def.in ? keyPaths(def.in, prefix) : [];
    case 'union':
      return (def.options ?? []).flatMap((option) => keyPaths(option, prefix));
    case 'array':
      return def.element ? keyPaths(def.element, prefix) : [];
    default:
      return [];
  }
}

describe('endpoints', () => {
  it('defines_the_51_endpoints_of_the_v1_api', () => {
    expect(definitions).toHaveLength(51);
  });

  it('gives_every_method_and_path_one_endpoint', () => {
    const routes = definitions.map(([, def]) => `${def.method} ${def.path}`);

    expect(new Set(routes).size).toBe(routes.length);
  });

  it('declares_every_path_parameter_in_params_and_nothing_else', () => {
    for (const [name, def] of definitions) {
      const inPath = [...def.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      const declared = Object.keys(def.params?.shape ?? {}).sort();

      expect(declared, name).toEqual(inPath);
    }
  });

  it('has_a_response_schema_iff_it_does_not_answer_204', () => {
    for (const [name, def] of definitions) {
      expect(def.response === undefined, name).toBe(def.status === 204);
    }
  });

  it('uses_only_known_error_codes', () => {
    for (const [name, def] of definitions) {
      for (const code of [...def.errors, ...implicitErrorCodes(def)]) {
        expect(ERROR_STATUS, name).toHaveProperty(code);
      }
    }
  });

  it('requires_a_session_for_every_unsafe_method_except_sign_up_and_log_in', () => {
    const openWrites = definitions
      .filter(
        ([, def]) => def.method !== 'GET' && def.auth !== 'required' && def.auth !== 'moderator',
      )
      .map(([name]) => name);

    expect(openWrites).toEqual(['signUp', 'logIn']);
  });
});

describe('input schemas', () => {
  it.each(inputParts.filter(({ label }) => !label.endsWith('.params')))(
    'rejects_unknown_keys_in_$label',
    ({ schema }) => {
      const result = schema.safeParse({ unexpectedKey: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['unexpectedKey'], path: [] }),
      );
    },
  );

  it.each(inputParts)('never_accepts_server_owned_fields_in_$label', ({ label, schema }) => {
    const offending = keyPaths(schema, label).filter((path) => {
      const key = path.slice(path.lastIndexOf('.') + 1);
      const isParam = label.endsWith('.params');
      return FORBIDDEN_INPUT_KEYS.includes(key) && !isParam && !ALLOWED_NESTED_KEYS.has(path);
    });

    expect(offending).toEqual([]);
  });

  it('finds_keys_nested_in_unions_and_wrappers', () => {
    const paths = keyPaths(endpoints.addTripPlace.body, 'body');

    expect(paths).toEqual(
      expect.arrayContaining(['body.place.key', 'body.place.location.lng', 'body.schedule.dayId']),
    );
  });
});

describe('implicitErrorCodes', () => {
  it('adds_csrf_media_type_validation_and_session_errors_to_an_authenticated_write', () => {
    expect(implicitErrorCodes(endpoints.putStopOrder)).toEqual(
      expect.arrayContaining([
        'csrf_rejected',
        'unsupported_media_type',
        'validation_failed',
        'unauthenticated',
      ]),
    );
  });

  it('adds_invalid_cursor_to_lists_only', () => {
    expect(implicitErrorCodes(endpoints.listPublicTrips)).toContain('invalid_cursor');
    expect(implicitErrorCodes(endpoints.searchPlaces)).not.toContain('invalid_cursor');
  });

  it('adds_no_session_error_to_anonymous_reads', () => {
    expect(implicitErrorCodes(endpoints.getLiveness)).toEqual([
      'malformed_request',
      'payload_too_large',
      'rate_limited',
      'internal_error',
    ]);
  });
});
