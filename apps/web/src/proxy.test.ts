import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const ORIGIN = 'http://localhost:3100';

function visit(path: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
}

function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  return location === null ? null : new URL(location, ORIGIN).pathname;
}

describe('proxy locale negotiation', () => {
  it.each([
    ['es-MX,es;q=0.9,en;q=0.5', '/es'],
    ['es-ES', '/es'],
    ['pt-BR,pt;q=0.9', '/pt-BR'],
    ['pt-PT', '/pt-BR'],
    ['en-GB', '/en'],
    ['de-DE,fr;q=0.8', '/en'],
  ])('sends_accept_language_%s_to_%s', (acceptLanguage, expected) => {
    expect(redirectTarget(visit('/', { 'accept-language': acceptLanguage }))).toBe(expected);
  });

  it('sends_a_visitor_without_accept_language_to_english', () => {
    expect(redirectTarget(visit('/'))).toBe('/en');
  });

  it('prefixes_an_unprefixed_path_with_the_best_match', () => {
    expect(redirectTarget(visit('/explore', { 'accept-language': 'es-AR' }))).toBe('/es/explore');
  });

  it('prefers_the_locale_the_visitor_last_used_over_accept_language', () => {
    const response = visit('/', { 'accept-language': 'es', cookie: 'NEXT_LOCALE=pt-BR' });

    expect(redirectTarget(response)).toBe('/pt-BR');
  });

  it('serves_a_prefixed_path_in_its_own_locale', () => {
    expect(redirectTarget(visit('/es/explore', { 'accept-language': 'pt-BR' }))).toBeNull();
  });
});

describe('proxy request id', () => {
  const forwardedId = (response: Response) =>
    response.headers.get('x-middleware-request-x-request-id');

  it('gives_every_page_request_an_id_the_render_and_onrequesterror_share', () => {
    expect(forwardedId(visit('/en/explore'))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('keeps_a_valid_id_from_a_hop_in_front_and_replaces_an_invalid_one', () => {
    expect(forwardedId(visit('/en/explore', { 'x-request-id': 'edge-0001-abcd' }))).toBe(
      'edge-0001-abcd',
    );
    expect(forwardedId(visit('/en/explore', { 'x-request-id': 'bad id!' }))).not.toBe('bad id!');
  });
});
