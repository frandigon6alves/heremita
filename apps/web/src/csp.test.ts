import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, createNonce, securityHeaders } from './csp';

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values.join(' ')];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  it('allows_scripts_and_styles_only_by_nonce_in_production', () => {
    const policy = directives(
      contentSecurityPolicy({ nonce: 'abc', isDev: false, httpsOnly: true }),
    );

    expect(policy.get('script-src')).toBe("'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy.get('style-src')).toBe("'self' 'nonce-abc'");
    expect(policy.get('worker-src')).toBe("'self'");
    expect(policy.get('frame-ancestors')).toBe("'none'");
    expect(policy.has('upgrade-insecure-requests')).toBe(true);
  });

  it('relaxes_eval_inline_styles_and_websockets_only_in_development', () => {
    const policy = directives(
      contentSecurityPolicy({ nonce: 'abc', isDev: true, httpsOnly: false }),
    );

    expect(policy.get('script-src')).toContain("'unsafe-eval'");
    // A nonce would make browsers ignore 'unsafe-inline'.
    expect(policy.get('style-src')).toBe("'self' 'unsafe-inline'");
    expect(policy.get('connect-src')).toContain('ws:');
    expect(policy.has('upgrade-insecure-requests')).toBe(false);
  });

  it('keeps_the_production_policy_without_upgrading_requests_over_plain_http', () => {
    const policy = directives(
      contentSecurityPolicy({ nonce: 'abc', isDev: false, httpsOnly: false }),
    );

    expect(policy.get('script-src')).toBe("'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy.has('upgrade-insecure-requests')).toBe(false);
  });

  it('allows_map_tiles_from_both_basemap_hosts', () => {
    const policy = directives(
      contentSecurityPolicy({ nonce: 'abc', isDev: false, httpsOnly: true }),
    );

    for (const name of ['img-src', 'connect-src']) {
      expect(policy.get(name)).toContain('https://tiles.openfreemap.org');
      expect(policy.get(name)).toContain('https://tiles.versatiles.org');
    }
  });
});

describe('securityHeaders', () => {
  it('sends_hsts_only_when_the_site_is_https_only', () => {
    expect(
      securityHeaders({ nonce: 'n', isDev: false, httpsOnly: true })['Strict-Transport-Security'],
    ).toBe('max-age=31536000; includeSubDomains');
    expect(securityHeaders({ nonce: 'n', isDev: false, httpsOnly: false })).not.toHaveProperty(
      'Strict-Transport-Security',
    );
  });
});

describe('createNonce', () => {
  it('returns_a_different_base64_value_each_call', () => {
    const first = createNonce();

    expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(createNonce()).not.toBe(first);
  });
});
