import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isTeacherGateEnabled, TEACHER_SESSION_COOKIE, verifyTeacherJwt } from '@/lib/teacher-token';

export async function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/teacher/:path*'],
};
