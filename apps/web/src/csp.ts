const MAP_TILE_ORIGINS = 'https://tiles.openfreemap.org https://tiles.versatiles.org';

/** Request header the root layout reads to put the nonce on its inline theme script. */
export const NONCE_HEADER = 'x-nonce';

export interface SecurityHeadersOptions {
  nonce: string;
  isDev: boolean;
}

/**
 * The Content-Security-Policy of every page (§I.web.csp). Next reads the nonce
 * back from the request header and puts it on its own scripts and styles.
 * `worker-src 'self'` is listed because `'strict-dynamic'` makes browsers
 * ignore `'self'` in `script-src`, and MapLibre starts a same-origin worker.
 */
export function contentSecurityPolicy({ nonce, isDev }: SecurityHeadersOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "worker-src 'self'",
    // Dev injects un-nonced <style> tags, and browsers ignore 'unsafe-inline' next to a nonce.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${MAP_TILE_ORIGINS}`,
    `connect-src 'self' ${MAP_TILE_ORIGINS}${isDev ? ' ws:' : ''}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ];
  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

/** Response headers set on every page next to the CSP. */
export function securityHeaders({ nonce, isDev }: SecurityHeadersOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': contentSecurityPolicy({ nonce, isDev }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (!isDev) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

/** A fresh, unguessable value per request. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}
