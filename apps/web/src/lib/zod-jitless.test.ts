import { describe, expect, it } from 'vitest';
import { disableZodJit } from './zod-jitless';

describe('disableZodJit', () => {
  it('creates_the_config_with_jit_off_before_zod_loads', () => {
    const target: Parameters<typeof disableZodJit>[0] = {};

    disableZodJit(target);

    expect(target.__zod_globalConfig).toEqual({ jitless: true });
  });

  it('updates_the_object_zod_already_holds', () => {
    const config = { jitless: false, locale: 'en' };
    const target = { __zod_globalConfig: config };

    disableZodJit(target);

    expect(target.__zod_globalConfig).toBe(config);
    expect(config).toEqual({ jitless: true, locale: 'en' });
  });
});
