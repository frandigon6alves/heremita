import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endpoints } from '../api/endpoints.js';
import { buildOpenApiDocument } from './document.js';

const document = buildOpenApiDocument();
const roundTripped: unknown = JSON.parse(JSON.stringify(document));

function collectRefs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectRefs);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      key === '$ref' && typeof child === 'string' ? [child] : collectRefs(child),
    );
  }
  return [];
}

describe('buildOpenApiDocument', () => {
  it('matches_the_committed_openapi_json', () => {
    const committed: unknown = JSON.parse(
      readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'),
    );

    // On failure run: pnpm --filter @heremita/shared openapi:generate
    expect(committed).toEqual(roundTripped);
  });

  it('is_an_openapi_3_1_document', () => {
    expect(document.openapi).toBe('3.1.0');
  });

  it('documents_every_endpoint_once', () => {
    const operationIds = Object.values(document.paths ?? {}).flatMap((pathItem) =>
      Object.values(pathItem as Record<string, { operationId?: string }>).map(
        (operation) => operation.operationId,
      ),
    );

    expect(operationIds.sort()).toEqual(Object.keys(endpoints).sort());
  });

  it('resolves_every_schema_reference', () => {
    const schemas = document.components?.schemas ?? {};
    const refs = collectRefs(roundTripped);
    const prefix = '#/components/schemas/';

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith(prefix), ref).toBe(true);
      expect(schemas, ref).toHaveProperty([ref.slice(prefix.length)]);
    }
  });

  it('renders_the_trip_plan_as_a_discriminated_one_of', () => {
    const tripPlan = document.components?.schemas?.TripPlan;

    expect(tripPlan).toMatchObject({
      oneOf: [
        { $ref: '#/components/schemas/TripPlanOwner' },
        { $ref: '#/components/schemas/TripPlanViewer' },
      ],
      discriminator: { propertyName: 'viewerRole' },
    });
  });

  it('documents_errors_as_problem_json_with_their_codes', () => {
    const responses = document.paths?.['/trips/{tripId}/days/{dayId}/stop-order']?.put?.responses;

    expect(responses?.['409']).toMatchObject({
      description: expect.stringContaining('`plan_changed`') as unknown,
      content: {
        'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
      },
    });
  });

  it('documents_both_success_statuses_of_put_my_review', () => {
    const responses = document.paths?.['/places/{placeId}/reviews/mine']?.put?.responses;

    expect(Object.keys(responses ?? {})).toEqual(expect.arrayContaining(['200', '201']));
  });
});
