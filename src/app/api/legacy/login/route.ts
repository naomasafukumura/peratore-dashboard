import { NextRequest, NextResponse } from 'next/server';
import { checkPassword, createSession, ensureLegacyTables } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  await ensureLegacyTables();
  if (!(await checkPassword(String(password ?? '').trim()))) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const res = NextResponse.json({ success: true });
  await createSession(res);
  return res;
}
