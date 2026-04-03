import { NextRequest, NextResponse } from 'next/server';
import { TEACHER_SESSION_COOKIE, isTeacherGateEnabled, verifyTeacherJwt } from '@/lib/teacher-token';

const PUBLIC_TEACHER_PATHS = ['/teacher/login', '/teacher/logout'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 先生ページ（ログイン・ログアウト以外）の認証チェック
  if (pathname.startsWith('/teacher') && !PUBLIC_TEACHER_PATHS.some(p => pathname.startsWith(p))) {
    if (!isTeacherGateEnabled()) return NextResponse.next();

    const token = req.cookies.get(TEACHER_SESSION_COOKIE)?.value;
    const ok = await verifyTeacherJwt(token);
    if (!ok) {
      const loginUrl = new URL('/teacher/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/teacher/:path*'],
};
