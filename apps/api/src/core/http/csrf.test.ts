import { describe, expect, it } from 'vitest';
import { csrfVerdict } from './csrf.js';

const WEB_ORIGIN = 'http://localhost:3100';
const JSON_BODY = { 'content-type': 'application/json', 'content-length': '2' };

describe('csrfVerdict', () => {
  it('allows_safe_methods_from_anywhere', () => {
    expect(csrfVerdict('GET', { 'sec-fetch-site': 'cross-site' }, WEB_ORIGIN)).toBe('allowed');
    expect(csrfVerdict('HEAD', {}, WEB_ORIGIN)).toBe('allowed');
  });

  it('allows_same_origin_fetch_metadata', () => {
    const headers = { 'sec-fetch-site': 'same-origin', ...JSON_BODY };

    expect(csrfVerdict('POST', headers, WEB_ORIGIN)).toBe('allowed');
  });

  it.each(['same-site', 'cross-site', 'none'])('rejects_sec_fetch_site_%s', (site) => {
    const headers = { 'sec-fetch-site': site, origin: WEB_ORIGIN, ...JSON_BODY };

    expect(csrfVerdict('PUT', headers, WEB_ORIGIN)).toBe('cross_site');
  });

  it('falls_back_to_an_exact_origin_match', () => {
    expect(csrfVerdict('PATCH', { origin: WEB_ORIGIN, ...JSON_BODY }, WEB_ORIGIN)).toBe('allowed');
    expect(csrfVerdict('PATCH', { origin: 'http://localhost:3101' }, WEB_ORIGIN)).toBe(
      'cross_site',
    );
    expect(csrfVerdict('PATCH', { origin: `${WEB_ORIGIN}.evil.example` }, WEB_ORIGIN)).toBe(
      'cross_site',
    );
  });

  it('rejects_unsafe_methods_without_origin_or_fetch_metadata', () => {
    expect(csrfVerdict('DELETE', {}, WEB_ORIGIN)).toBe('cross_site');
  });

  it('rejects_a_non_json_body', () => {
    const form = { origin: WEB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' };

    expect(csrfVerdict('POST', { ...form, 'content-length': '3' }, WEB_ORIGIN)).toBe('not_json');
    expect(csrfVerdict('POST', { ...form, 'transfer-encoding': 'chunked' }, WEB_ORIGIN)).toBe(
      'not_json',
    );
  });

  it('accepts_json_with_parameters_and_bodyless_requests', () => {
    const json = { origin: WEB_ORIGIN, 'content-type': 'Application/JSON; charset=utf-8' };

    expect(csrfVerdict('POST', { ...json, 'content-length': '2' }, WEB_ORIGIN)).toBe('allowed');
    expect(csrfVerdict('DELETE', { origin: WEB_ORIGIN, 'content-length': '0' }, WEB_ORIGIN)).toBe(
      'allowed',
    );
  });
});
