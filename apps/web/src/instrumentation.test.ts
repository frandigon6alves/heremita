import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestError } from './instrumentation';

const context = {
  routerKind: 'App Router',
  routePath: '/[locale]/explore',
  routeType: 'render',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
  renderType: 'dynamic',
} as const;

afterEach(() => vi.restoreAllMocks());

describe('onRequestError', () => {
  it('logs_the_digest_with_the_request_id_and_without_the_query', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('API down'), { digest: '2741936157' });

    await onRequestError(
      error,
      {
        path: '/en/explore?q=private+search',
        method: 'GET',
        headers: { 'x-request-id': '0193a000-aaaa-7000-8000-000000000001' },
      },
      context,
    );

    expect(log).toHaveBeenCalledOnce();
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      level: 'error',
      msg: 'request failed',
      digest: '2741936157',
      requestId: '0193a000-aaaa-7000-8000-000000000001',
      method: 'GET',
      path: '/en/explore',
      route: '/[locale]/explore',
      routeType: 'render',
      error: 'API down',
    });
    expect(line).not.toContain('private');
  });

  it('logs_null_when_the_request_had_no_id_or_the_error_no_digest', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await onRequestError('boom', { path: '/en', method: 'GET', headers: {} }, context);

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      digest: null,
      requestId: null,
      error: 'boom',
    });
  });
});
