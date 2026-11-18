import { idSchema } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuidv7.js';

describe('uuidv7', () => {
  it('produces_a_version_7_rfc_9562_uuid', () => {
    const id = uuidv7(Date.UTC(2026, 10, 18));

    expect(idSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('starts_with_the_unix_milliseconds', () => {
    const unixMs = Date.UTC(2026, 10, 18, 12, 30);

    const id = uuidv7(unixMs);

    expect(Number.parseInt(id.replace('-', '').slice(0, 12), 16)).toBe(unixMs);
  });

  it('sorts_by_time', () => {
    const earlier = uuidv7(1_000);
    const later = uuidv7(2_000);

    expect(earlier < later).toBe(true);
  });
});
