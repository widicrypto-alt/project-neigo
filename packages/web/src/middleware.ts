import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'neigo_session';

function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login') return true;

  // Any direct static file request from /public (e.g. /img/*.svg).
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;

  // Next internals + static assets should never be auth-gated.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname.startsWith('/icon-')
  ) {
    return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Anonymous users: only home + login are accessible.
  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    const next = `${pathname}${search}`;
    if (next && next !== '/') loginUrl.searchParams.set('next', next);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in users hitting /login are sent to chat by default.
  if (hasSession && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next');
    const target = next && next.startsWith('/') ? next : '/chat';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
