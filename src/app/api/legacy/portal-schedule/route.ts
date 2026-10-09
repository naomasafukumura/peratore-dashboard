import { NextRequest, NextResponse } from 'next/server';
import { ensureLegacyTables, fetchSchedule, readStore, type LegacyStudentsDoc } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

/** 受講生のマイページ用：本人のレッスン予定だけ返す */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')?.trim();
  if (!key) return NextResponse.json([]);
  await ensureLegacyTables();
  const doc = await readStore<LegacyStudentsDoc>('students');
  const me = (doc.students ?? []).find(s => s.accessKey === key);
  if (!me) return NextResponse.json([]);
  try {
    const all = await fetchSchedule();
    if (!Array.isArray(all)) return NextResponse.json(all);
    return NextResponse.json(all.filter((l: { studentId?: unknown }) => String(l.studentId) === String(me.id)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
