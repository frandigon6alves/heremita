import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { contentSecurityPolicy, createNonce, NONCE_HEADER, securityHeaders } from './csp';
import { routing } from './i18n/routing';
import { REQUEST_PATH_HEADER } from './lib/routes';
import { publicEnv } from './public-env';

const handleLocale = createMiddleware(routing);

/**
 * Runs before every page: picks the locale (redirecting unprefixed URLs) and
 * sets a per-request nonce CSP plus the other security headers.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const isDev = process.env.NODE_ENV === 'development';
  const options = { nonce, isDev, httpsOnly: !isDev && !publicEnv.NEXT_PUBLIC_E2E };

  // Next takes the nonce from the request's CSP header while rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy(options));
  requestHeaders.set(REQUEST_PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = handleLocale(new NextRequest(request, { headers: requestHeaders }));
  for (const [name, value] of Object.entries(securityHeaders(options))) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Not the API rewrite, Next's static files and image optimiser, or any file with an extension.
      source: '/((?!api|_next/static|_next/image|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
