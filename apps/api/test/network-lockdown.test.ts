import { describe, expect, it } from 'vitest';

// The lockdown (test/support/network-lockdown.ts) relies on Node's bundled
// undici honouring the dispatcher of the installed one. If an upgrade broke
// that, every test would still pass while real requests left the machine.
describe('network lockdown', () => {
  it('refuses_a_request_to_the_internet_from_any_test', async () => {
    const failure: unknown = await fetch('https://example.com', {
      signal: AbortSignal.timeout(5_000),
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as TypeError).cause).toMatchObject({ code: 'UND_MOCK_ERR_MOCK_NOT_MATCHED' });
  });
});
