import { NextRequest, NextResponse } from 'next/server';
import { ensureLegacyTables, readStore, type LegacyStudentsDoc } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

/**
 * 受講生のマイページ用。accessKey が一致した本人の分だけを旧 students.json と同じ形で返す
 * （旧版は全員分の students.json を誰でも取れた）。
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')?.trim();
  if (!key) return NextResponse.json({ students: [], templates: {} });
  await ensureLegacyTables();
  const doc = await readStore<LegacyStudentsDoc>('students');
  const me = (doc.students ?? []).filter(s => s.accessKey === key);
  return NextResponse.json(
    { students: me, templates: me.length ? doc.templates ?? {} : {} },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
