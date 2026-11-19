import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { FixedClock } from '../clock/fixed-clock.js';
import { AppThrottlerGuard } from './app-throttler.guard.js';
import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  CLIENT_IP_SIGNATURE_MAX_AGE_MS,
  ClientAddress,
  signClientIp,
} from './client-address.js';

const SECRET = 'unit-test-secret-0123456789abcdefgh';
const NOW = Date.parse('2026-11-19T10:00:00.000Z');

class InspectableGuard extends AppThrottlerGuard {
  trackerOf(request: Record<string, unknown>): Promise<string> {
    return this.getTracker(request);
  }
}

function guardWith(secret: string | undefined): InspectableGuard {
  const env = parseEnv({
    DATABASE_URL: 'postgresql://heremita:heremita@localhost:5434/heremita',
    GEOCODING_PROVIDER: 'fake',
    ROUTING_PROVIDER: 'fake',
    SERVER_FETCH_SECRET: secret,
  });
  return new InspectableGuard(
    { throttlers: [] },
    new ThrottlerStorageService(),
    new Reflector(),
    new ClientAddress(env, new FixedClock(new Date(NOW).toISOString())),
  );
}

const guard = guardWith(SECRET);

function serverRender(clientIp: string, signature: string) {
  return {
    ip: '192.0.2.10',
    headers: { [CLIENT_IP_HEADER]: clientIp, [CLIENT_IP_SIGNATURE_HEADER]: signature },
  };
}

describe('AppThrottlerGuard', () => {
  it('keys_signed_in_callers_by_user_id', async () => {
    const request = { ip: '203.0.113.7', headers: {}, user: { id: 'user-1' } };

    await expect(guard.trackerOf(request)).resolves.toBe('user:user-1');
  });

  it('keys_anonymous_callers_by_address', async () => {
    await expect(guard.trackerOf({ ip: '203.0.113.7', headers: {} })).resolves.toBe(
      'ip:203.0.113.7',
    );
  });

  it('folds_ipv6_callers_into_their_64', async () => {
    await expect(guard.trackerOf({ ip: '2001:db8:1:2:3:4:5:6', headers: {} })).resolves.toBe(
      'ip:2001:db8:1:2::/64',
    );
  });

  it('keys_a_validly_signed_server_render_by_the_client_address', async () => {
    const request = serverRender('203.0.113.7', signClientIp(SECRET, '203.0.113.7', NOW));

    await expect(guard.trackerOf(request)).resolves.toBe('ip:203.0.113.7');
  });

  it('accepts_a_signature_from_slightly_ahead_or_behind_within_the_window', async () => {
    const ahead = serverRender('203.0.113.7', signClientIp(SECRET, '203.0.113.7', NOW + 5_000));
    const behind = serverRender(
      '203.0.113.7',
      signClientIp(SECRET, '203.0.113.7', NOW - CLIENT_IP_SIGNATURE_MAX_AGE_MS),
    );

    await expect(guard.trackerOf(ahead)).resolves.toBe('ip:203.0.113.7');
    await expect(guard.trackerOf(behind)).resolves.toBe('ip:203.0.113.7');
  });

  it.each([
    ['missing', { ip: '192.0.2.10', headers: { [CLIENT_IP_HEADER]: '203.0.113.7' } }],
    ['forged', serverRender('203.0.113.7', signClientIp(`${SECRET}-other`, '203.0.113.7', NOW))],
    [
      'expired',
      serverRender(
        '203.0.113.7',
        signClientIp(SECRET, '203.0.113.7', NOW - CLIENT_IP_SIGNATURE_MAX_AGE_MS - 1),
      ),
    ],
    ['for another address', serverRender('203.0.113.8', signClientIp(SECRET, '203.0.113.7', NOW))],
    ['malformed', serverRender('203.0.113.7', 'not-a-signature')],
    [
      'truncated',
      serverRender('203.0.113.7', signClientIp(SECRET, '203.0.113.7', NOW).slice(0, -2)),
    ],
    ['over a non-address', serverRender('evil', signClientIp(SECRET, 'evil', NOW))],
  ])('keys_a_%s_signature_by_the_request_address', async (_name, request) => {
    await expect(guard.trackerOf(request)).resolves.toBe('ip:192.0.2.10');
  });

  it('ignores_valid_looking_signatures_when_no_secret_is_configured', async () => {
    const request = serverRender('203.0.113.7', signClientIp(SECRET, '203.0.113.7', NOW));

    await expect(guardWith(undefined).trackerOf(request)).resolves.toBe('ip:192.0.2.10');
  });
});
