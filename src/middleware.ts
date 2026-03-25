import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isTeacherGateEnabled, TEACHER_SESSION_COOKIE, verifyTeacherJwt } from '@/lib/teacher-token';

export async function middleware(req: NextRequest) {
  if (!isTeacherGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (pathname === '/teacher/login' || pathname.startsWith('/teacher/login/')) {
    return NextResponse.next();
  }

  if (pathname === '/teacher/logout' || pathname.startsWith('/teacher/logout')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/teacher-auth/')) {
    return NextResponse.next();
  }

  const ok = await verifyTeacherJwt(req.cookies.get(TEACHER_SESSION_COOKIE)?.value);
  if (ok) {
    return NextResponse.next();
  }

  const login = new URL('/teacher/login', req.url);
  login.searchParams.set('next', `${pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/', '/teacher/:path*'],
};
