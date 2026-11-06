import { type NextRequest, NextResponse } from 'next/server';

// Shortcut only: the real check is the API call each admin page makes with the cookie.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login' || request.cookies.has('aurevi_admin')) return NextResponse.next();
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
