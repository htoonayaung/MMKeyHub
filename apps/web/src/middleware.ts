import { NextRequest, NextResponse } from 'next/server';
import { normalizeAdminPortalPath } from '@/lib/adminRoute';

const DEFAULT_ADMIN_PATH = '/admin';

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getRequestHost(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const rawHost = (forwardedHost || request.headers.get('host') || '').split(',')[0].trim();
  return rawHost.replace(/:\d+$/, '').toLowerCase();
}

function applyAdminSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const configuredAdminPath = normalizeAdminPortalPath(
    process.env.ADMIN_PORTAL_PATH || process.env.NEXT_PUBLIC_ADMIN_PORTAL_PATH
  );
  const allowedAdminHost = (process.env.ADMIN_ALLOWED_HOST || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();

  const isCustomSecretPath = configuredAdminPath !== DEFAULT_ADMIN_PATH;
  const isDefaultAdminReq = matchesPathPrefix(pathname, DEFAULT_ADMIN_PATH);
  const isConfiguredAdminReq = matchesPathPrefix(pathname, configuredAdminPath);

  // When a custom secret path (e.g. /ops-portal-9x7k) is configured,
  // completely hide the default /admin URL by returning 404 Not Found.
  if (isCustomSecretPath && isDefaultAdminReq) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Only inspect requests targeting the active Admin Portal route
  if (!isConfiguredAdminReq) {
    return NextResponse.next();
  }

  // When a dedicated admin subdomain (e.g. admin.yourdomain.com) is configured,
  // reject admin access from the main public storefront domain with 404 Not Found.
  if (allowedAdminHost) {
    const requestHost = getRequestHost(request);
    if (requestHost && requestHost !== allowedAdminHost) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: {
          'X-Robots-Tag': 'noindex, nofollow',
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  // Rewrite the custom secret URL internally to Next.js /admin route
  if (isCustomSecretPath) {
    const rewriteUrl = request.nextUrl.clone();
    const suffix = pathname.slice(configuredAdminPath.length);
    rewriteUrl.pathname = `${DEFAULT_ADMIN_PATH}${suffix}`;
    return applyAdminSecurityHeaders(NextResponse.rewrite(rewriteUrl));
  }

  return applyAdminSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Run on all page paths except Next.js static assets, images, and API routes
     * so custom secret ADMIN_PORTAL_PATH values are always intercepted cleanly.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images|assets|robots.txt|sitemap.xml).*)',
  ],
};
