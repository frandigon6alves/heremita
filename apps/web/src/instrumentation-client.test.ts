import { describe, expect, it } from 'vitest';
import { config } from 'zod/v4/core';

describe('instrumentation-client', () => {
  it('turns_zod_jit_off_through_the_public_config', async () => {
    await import('./instrumentation-client');

    expect(config().jitless).toBe(true);
  });
});
