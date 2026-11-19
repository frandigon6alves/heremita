import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { accessLogFields, loggerParams, REDACTED_PATHS, requestId } from './logger-params.js';

const ENV = parseEnv({
  DATABASE_URL: 'postgresql://heremita:heremita@localhost:5434/heremita',
  GEOCODING_PROVIDER: 'fake',
  ROUTING_PROVIDER: 'fake',
  ALLOW_FAKE_PROVIDERS: 'true',
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://heremita.example',
});

function capture(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  return { stream, lines: () => chunks.join('').trim().split('\n') };
}

function incoming(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function fakeResponse(): ServerResponse & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as ServerResponse & { headers: Record<string, string> };
}

describe('redaction', () => {
  it('never_writes_cookies_authorization_passwords_or_tokens', () => {
    const { stream, lines } = capture();
    const logger = pino({ redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, stream);

    logger.info(
      {
        req: { headers: { cookie: 'hm_session=s3cr3t-a', authorization: 'Bearer s3cr3t-b' } },
        res: { headers: { 'set-cookie': 'hm_session=s3cr3t-c' } },
        body: { password: 's3cr3t-d', currentPassword: 's3cr3t-e', newPassword: 's3cr3t-f' },
        trip: { shareToken: 's3cr3t-g', token: 's3cr3t-h' },
        password: 's3cr3t-i',
      },
      'probe',
    );

    const line = lines()[0] ?? '';
    expect(line).not.toContain('s3cr3t');
    expect(JSON.parse(line)).toMatchObject({ body: { password: '[redacted]' } });
  });
});

describe('requestId', () => {
  it('reuses_a_well_formed_incoming_id_and_echoes_it', () => {
    const response = fakeResponse();

    const id = requestId(incoming({ 'x-request-id': 'abc-123-DEF' }), response);

    expect(id).toBe('abc-123-DEF');
    expect(response.headers['x-request-id']).toBe('abc-123-DEF');
  });

  it.each(['short', 'has spaces in it', 'x'.repeat(65), '<script>alert(1)</script>'])(
    'replaces_a_malformed_incoming_id_%#',
    (value) => {
      const response = fakeResponse();

      const id = requestId(incoming({ 'x-request-id': value }), response);

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
      expect(response.headers['x-request-id']).toBe(id);
    },
  );
});

describe('accessLogFields', () => {
  it('logs_the_route_template_and_never_the_url', () => {
    const request = {
      method: 'GET',
      url: '/api/v1/shared/secret-token/plan?q=rua+augusta',
      originalUrl: '/api/v1/shared/secret-token/plan?q=rua+augusta',
      route: { path: '/api/v1/shared/:shareToken/plan' },
      user: { id: 'u1' },
    } as unknown as IncomingMessage;

    const fields = accessLogFields(request, { statusCode: 200 } as ServerResponse);

    expect(fields).toEqual({
      method: 'GET',
      route: '/api/v1/shared/:shareToken/plan',
      status: 200,
      userId: 'u1',
    });
  });

  it('logs_no_route_for_unmatched_requests', () => {
    const request = { method: 'GET', url: '/x?lat=1' } as IncomingMessage;

    expect(accessLogFields(request, { statusCode: 404 } as ServerResponse)).toMatchObject({
      route: null,
      userId: null,
    });
  });
});

describe('loggerParams', () => {
  it('writes_quiet_json_lines_at_the_configured_level', () => {
    const params = loggerParams(ENV);

    expect(params.pinoHttp).toMatchObject({
      level: 'info',
      quietReqLogger: true,
      quietResLogger: true,
      transport: undefined,
    });
  });

  it('is_silent_in_tests_unless_a_test_captures_the_log', () => {
    const testEnv = { ...ENV, NODE_ENV: 'test' as const };
    const { stream } = capture();

    expect(loggerParams(testEnv).pinoHttp).toMatchObject({ level: 'silent' });
    expect(loggerParams(testEnv, stream).pinoHttp).toEqual([
      expect.objectContaining({ level: 'info' }),
      stream,
    ]);
  });
});
