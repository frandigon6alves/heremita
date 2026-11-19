import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { endpoints, type EndpointDef, type EndpointName } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ENV } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import { ENDPOINT } from '../src/core/http/endpoint.decorator.js';
import { PENDING_ENDPOINTS } from './support/pending-endpoints.js';
import { UNREACHABLE_DATABASE_URL } from './support/app.js';

interface RouteHandler {
  name: string;
  def: EndpointDef | undefined;
}

/** Every route handler of every controller in the application. */
async function routeHandlers(): Promise<RouteHandler[]> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] })
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, DATABASE_URL: UNREACHABLE_DATABASE_URL }))
    .compile();
  try {
    const scanner = new MetadataScanner();
    return moduleRef
      .get(DiscoveryService)
      .getControllers()
      .flatMap(({ instance, name }) => {
        const prototype = Object.getPrototypeOf(instance) as Record<string, () => unknown>;
        return scanner.getAllMethodNames(prototype).flatMap((method) => {
          const handler = prototype[method];
          return handler && Reflect.hasMetadata(PATH_METADATA, handler)
            ? [
                {
                  name: `${String(name)}.${method}`,
                  def: Reflect.getMetadata(ENDPOINT, handler) as EndpointDef | undefined,
                },
              ]
            : [];
        });
      });
  } finally {
    await moduleRef.close();
  }
}

describe('route table', () => {
  it('gives_every_route_handler_an_endpoint_definition', async () => {
    const handlers = await routeHandlers();

    const untyped = handlers.filter((handler) => !handler.def).map((handler) => handler.name);

    expect(untyped).toEqual([]);
  });

  it('implements_every_endpoint_of_the_contract_once_except_the_pending_ones', async () => {
    const handlers = await routeHandlers();
    const implemented = handlers.map((handler) => handler.def);
    const expected = Object.entries(endpoints)
      .filter(([name]) => !PENDING_ENDPOINTS.includes(name as EndpointName))
      .map(([, def]) => def);

    expect(new Set(implemented).size).toBe(implemented.length);
    expect(new Set(implemented)).toEqual(new Set(expected));
  });

  it('lists_only_real_endpoints_as_pending', () => {
    for (const name of PENDING_ENDPOINTS) {
      expect(endpoints).toHaveProperty(name);
    }
  });
});
