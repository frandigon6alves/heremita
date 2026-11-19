import { describe, expect, it } from 'vitest';
import { config } from 'zod/v4/core';
import { disableZodJit } from './zod-config.js';

describe('disableZodJit', () => {
  it('turns_the_jit_off_through_the_public_config', () => {
    disableZodJit();

    expect(config().jitless).toBe(true);
  });
});
