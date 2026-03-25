import { TEACHER_SESSION_COOKIE } from '@/lib/teacher-token';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/teacher/login', req.nextUrl.origin));
  res.cookies.set(TEACHER_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
