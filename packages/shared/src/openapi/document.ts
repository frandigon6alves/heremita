import {
  createDocument,
  type oas31,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
  type ZodOpenApiResponsesObject,
} from 'zod-openapi';
import { endpoints, implicitErrorCodes, type EndpointDef } from '../api/endpoints.js';
import { API_PREFIX, APP_NAME } from '../constants.js';
import { ERROR_STATUS, type ErrorCode } from '../error-codes.js';
import { PROBLEM_CONTENT_TYPE, problemDetailsSchema } from '../problem.js';

export type OpenApiDocument = ReturnType<typeof createDocument>;

const JSON_CONTENT_TYPE = 'application/json';
const SESSION_SCHEME = 'session';

type OperationKey = 'get' | 'post' | 'put' | 'patch' | 'delete';

function security(def: EndpointDef): oas31.SecurityRequirementObject[] {
  switch (def.auth) {
    case 'none':
      return [];
    case 'optional':
      return [{}, { [SESSION_SCHEME]: [] }];
    case 'required':
    case 'moderator':
      return [{ [SESSION_SCHEME]: [] }];
  }
}

function successResponses(def: EndpointDef): ZodOpenApiResponsesObject {
  const responses: ZodOpenApiResponsesObject = {};
  const statuses = def.alternateStatus ? [def.status, def.alternateStatus] : [def.status];
  for (const status of statuses) {
    responses[`${status}`] = def.response
      ? { description: 'Success', content: { [JSON_CONTENT_TYPE]: { schema: def.response } } }
      : { description: 'Success, no content' };
  }
  return responses;
}

/** One problem response per status; its description lists the `code` values it can carry. */
function errorResponses(def: EndpointDef): ZodOpenApiResponsesObject {
  const codesByStatus = new Map<(typeof ERROR_STATUS)[ErrorCode], ErrorCode[]>();
  for (const code of new Set([...def.errors, ...implicitErrorCodes(def)])) {
    const status = ERROR_STATUS[code];
    codesByStatus.set(status, [...(codesByStatus.get(status) ?? []), code]);
  }
  const responses: ZodOpenApiResponsesObject = {};
  for (const status of [...codesByStatus.keys()].sort((a, b) => a - b)) {
    const codes = codesByStatus.get(status) ?? [];
    responses[`${status}`] = {
      description: `Problem with code ${codes.map((code) => `\`${code}\``).join(', ')}`,
      content: { [PROBLEM_CONTENT_TYPE]: { schema: problemDetailsSchema } },
    };
  }
  return responses;
}

function operation(name: string, def: EndpointDef): ZodOpenApiOperationObject {
  return {
    operationId: name,
    tags: [def.path.split('/')[1] ?? 'root'],
    security: security(def),
    ...(def.params || def.query
      ? {
          requestParams: {
            ...(def.params && { path: def.params }),
            ...(def.query && { query: def.query }),
          },
        }
      : {}),
    ...(def.body && {
      requestBody: { required: true, content: { [JSON_CONTENT_TYPE]: { schema: def.body } } },
    }),
    responses: { ...successResponses(def), ...errorResponses(def) },
  };
}

/** The OpenAPI 3.1 document of `/api/v1`, generated from the endpoint table. Never edited by hand. */
export function buildOpenApiDocument(): OpenApiDocument {
  const paths: ZodOpenApiPathsObject = {};
  for (const [name, def] of Object.entries(endpoints) as [string, EndpointDef][]) {
    const pathItem = (paths[def.path] ??= {});
    pathItem[def.method.toLowerCase() as OperationKey] = operation(name, def);
  }
  return createDocument(
    {
      openapi: '3.1.0',
      info: {
        title: `${APP_NAME} API`,
        version: '1',
        description:
          'Errors are RFC 9457 problem documents; branch on `code`. Lists are keyset-paginated: send back `nextCursor` as `cursor`.',
      },
      servers: [{ url: API_PREFIX }],
      components: {
        securitySchemes: {
          [SESSION_SCHEME]: {
            type: 'apiKey',
            in: 'cookie',
            name: 'hm_session',
            description:
              'Opaque session cookie set by sign-up and log-in; named `__Host-hm_session` when served over HTTPS.',
          },
        },
      },
      paths,
    },
    {
      // Responses are allowlisted by the API, but a generated client must not
      // reject a field added later: additive changes stay non-breaking.
      override: ({ jsonSchema, zodSchema, io }) => {
        if (io === 'output' && zodSchema._zod.def.type === 'object') {
          delete jsonSchema.additionalProperties;
        }
      },
    },
  );
}
