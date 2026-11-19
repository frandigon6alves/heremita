import { describe, expect, it, vi } from 'vitest';

const disableZodJit = vi.hoisted(() => vi.fn());
vi.mock('@heremita/shared/zod-config', () => ({ disableZodJit }));

describe('schemas', () => {
  it('turns_zod_jit_off_before_handing_out_a_schema', async () => {
    const { logInBodySchema } = await import('./schemas');

    expect(disableZodJit).toHaveBeenCalledTimes(1);
    expect(logInBodySchema).toBeDefined();
  });
});
