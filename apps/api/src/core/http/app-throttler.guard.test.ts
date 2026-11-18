import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { AppThrottlerGuard } from './app-throttler.guard.js';

class InspectableGuard extends AppThrottlerGuard {
  trackerOf(request: Record<string, unknown>): Promise<string> {
    return this.getTracker(request);
  }
}

const guard = new InspectableGuard(
  { throttlers: [] },
  new ThrottlerStorageService(),
  new Reflector(),
);

describe('AppThrottlerGuard', () => {
  it('keys_signed_in_callers_by_user_id', async () => {
    const request = { ip: '203.0.113.7', user: { id: 'user-1' } };

    await expect(guard.trackerOf(request)).resolves.toBe('user:user-1');
  });

  it('keys_anonymous_callers_by_address', async () => {
    await expect(guard.trackerOf({ ip: '203.0.113.7' })).resolves.toBe('ip:203.0.113.7');
  });
});
