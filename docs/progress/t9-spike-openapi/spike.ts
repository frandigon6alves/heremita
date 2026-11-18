import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createDocument } from 'zod-openapi';
import { z } from 'zod';
import { problemDetailsSchema } from '../../packages/shared/src/problem.ts';
import {
  addTripPlaceBodySchema,
  tripPlanSchema,
  tripPlanOwnerSchema,
} from '../../packages/shared/src/plan.ts';
import { tripSchema } from '../../packages/shared/src/trips.ts';
import { searchPlacesQuerySchema } from '../../packages/shared/src/places.ts';

const req = createRequire('/Users/frangoncalves/Desktop/DEV/heremita/node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/');
const Ajv2020 = req('ajv/dist/2020').default;
const addFormats = req('ajv-formats').default;

const problem = { 'application/problem+json': { schema: problemDetailsSchema } };
const doc = createDocument(
  {
    openapi: '3.1.0',
    info: { title: 'spike', version: '0' },
    paths: {
      '/trips/{tripId}/plan': {
        get: {
          requestParams: { path: z.object({ tripId: z.uuid() }) },
          responses: {
            '200': { description: 'ok', content: { 'application/json': { schema: tripPlanSchema } } },
            '404': { description: 'nf', content: problem },
          },
        },
      },
      '/trips/{tripId}': {
        get: {
          requestParams: { path: z.object({ tripId: z.uuid() }) },
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: tripSchema } } } },
        },
      },
      '/trips/{tripId}/places': {
        post: {
          requestParams: { path: z.object({ tripId: z.uuid() }) },
          requestBody: { content: { 'application/json': { schema: addTripPlaceBodySchema } } },
          responses: {
            '201': { description: 'created', content: { 'application/json': { schema: tripPlanOwnerSchema } } },
            '422': { description: 'invalid', content: problem },
          },
        },
      },
      '/places/search': {
        get: {
          requestParams: { query: searchPlacesQuerySchema },
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  },
  { reused: process.env.REUSED === 'ref' ? 'ref' : 'inline' },
);

const out = '/private/tmp/claude-501/-Users-frangoncalves-Desktop-DEV-nextjs-danelfin/5d30f6cb-38c2-4644-bbcf-41393fffbe57/scratchpad/heremita/impl/t9-openapi.json';
const json = JSON.stringify(doc, null, 2);
(await import('node:fs')).writeFileSync(out, json);

const findings: string[] = [];
if (json.includes('"nullable"')) findings.push('FAIL: 3.0-style nullable present');
const comps = Object.keys(doc.components?.schemas ?? {});
findings.push(`components: ${comps.join(', ')}`);
const plan = doc.components?.schemas?.TripPlan as Record<string, unknown> | undefined;
findings.push(`TripPlan keys: ${plan ? Object.keys(plan).join(',') : 'MISSING'}`);
findings.push(`TripPlan: ${JSON.stringify(plan)}`);

// Ajv mis-resolves the OAS `$dynamicRef: '#meta'` hook; schemas are checked below with strict 2020-12 instead.
const oas = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-frangoncalves-Desktop-DEV-nextjs-danelfin/5d30f6cb-38c2-4644-bbcf-41393fffbe57/scratchpad/heremita/impl/oas31-schema.json', 'utf8').replaceAll('"$dynamicRef": "#meta"', '"type": ["object", "boolean"]'));
const metaAjv = new Ajv2020({ strict: false, allErrors: true });
addFormats(metaAjv);
const validDoc = metaAjv.validate(oas, doc);
findings.push(`OAS 3.1 document schema: ${validDoc ? 'VALID' : JSON.stringify(metaAjv.errors)}`);

// Every component must compile as JSON Schema 2020-12 and accept/reject real payloads.
const ajv = new Ajv2020({ strict: true, allErrors: true, discriminator: false });
ajv.addKeyword('discriminator');
ajv.addKeyword('components');
addFormats(ajv);
const bundle = { $id: 'spike:doc', components: doc.components };
ajv.addSchema(bundle);
for (const name of comps) ajv.getSchema(`spike:doc#/components/schemas/${name}`);
findings.push('all components compiled (strict)');

const validate = ajv.getSchema('spike:doc#/components/schemas/TripPlan')!;
const u = (n: number) => `0190a1b2-c3d4-7e5f-8a9b-0000000000${String(n).padStart(2, '0')}`;
const place = { id: u(1), source: 'osm', key: 'osm:W:1', name: 'X', label: null, category: 'sight', location: { lng: 1, lat: 2 }, countryCode: 'PT' };
const author = { id: u(2), displayName: 'A', isDemo: false };
const tripOwner = { viewerRole: 'owner', id: u(3), title: 'T', description: null, destination: null, startDate: null, dayCount: 1, placeCount: 1, defaultMode: 'walk', visibility: 'private', shareToken: null, author, copiedFrom: null, createdAt: '2026-11-18T00:00:00.000Z', updatedAt: '2026-11-18T00:00:00.000Z' };
const tp = { id: u(4), place, rating: { count: 0, average: null, distribution: null }, addedAt: '2026-11-18T00:00:00.000Z' };
const owner = tripPlanOwnerSchema.parse({ viewerRole: 'owner', trip: tripOwner, planVersion: 0, places: [{ ...tp, note: 'n' }], days: [{ id: u(5), number: 1, date: null, mode: 'walk', modeOverride: null, stops: [{ id: u(6), tripPlaceId: u(4), modeToNext: null }] }], routes: [] });
findings.push(`owner payload (zod-parsed) valid vs OpenAPI TripPlan: ${validate(owner)} ${JSON.stringify(validate.errors ?? [])}`);
const viewerBad = { ...owner, viewerRole: 'viewer' };
findings.push(`owner shape tagged viewer rejected: ${!validate(viewerBad)}`);
findings.push(`bogus role rejected: ${!validate({ ...owner, viewerRole: 'x' })}`);
console.log(findings.join('\n'));
