import { describe, expect, it } from 'vitest';
import { readinessResponseSchema } from './health.js';

describe('readinessResponseSchema', () => {
  it('accepts a ready response', () => {
    const body = { status: 'ok', db: 'up' };

    const result = readinessResponseSchema.safeParse(body);

    expect(result).toEqual({ success: true, data: body });
  });

  it('rejects a response whose database is down', () => {
    const body = { status: 'ok', db: 'down' };

    const result = readinessResponseSchema.safeParse(body);

    expect(result.success).toBe(false);
  });
});
