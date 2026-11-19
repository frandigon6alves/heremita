import { describe, expect, it } from 'vitest';
import { endpoints } from './endpoints.js';
import { apiRoutes } from './route-table.js';

describe('apiRoutes', () => {
  it('names_every_endpoint_with_its_method_and_path', () => {
    const fromEndpoints = Object.fromEntries(
      Object.entries(endpoints).map(([name, def]) => [
        name,
        { name, method: def.method, path: def.path },
      ]),
    );

    expect(apiRoutes).toEqual(fromEndpoints);
  });
});
