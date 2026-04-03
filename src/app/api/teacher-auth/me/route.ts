import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  isTeacherGateActive,
  verifyTeacherSessionToken,
} from '@/lib/teacher-session-server';
import { TEACHER_SESSION_COOKIE } from '@/lib/teacher-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** クライアント向け: 現在のteacher_sessionクッキーが有効か返す */
export async function GET() {
  if (!isTeacherGateActive()) {
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const jar = await cookies();
  const token = jar.get(TEACHER_SESSION_COOKIE)?.value;
  const ok = await verifyTeacherSessionToken(token);
  return NextResponse.json({ ok }, { headers: { 'Cache-Control': 'no-store' } });
}
