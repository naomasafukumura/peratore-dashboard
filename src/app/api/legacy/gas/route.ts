import { NextRequest, NextResponse } from 'next/server';
import { fetchSchedule, isStaff, unauthorized } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

/** スタッフ用：GAS のレッスン予定（旧版はブラウザから GAS をキー付きで直接叩いていた） */
export async function GET(req: NextRequest) {
  if (!(await isStaff(req))) return unauthorized();
  try {
    return NextResponse.json(await fetchSchedule(req.nextUrl.searchParams.get('studentId')));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
