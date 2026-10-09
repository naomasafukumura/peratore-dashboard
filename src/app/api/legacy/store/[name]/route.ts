import { NextRequest, NextResponse } from 'next/server';
import { isStaff, readStore, STORE_NAMES, unauthorized, writeStore, type StoreName } from '@/lib/legacy';
import { logError } from '@/lib/error-log';

export const dynamic = 'force-dynamic';

/** 旧 students.json / staff-data.json / updates-data.json の読み出しと、save_staff.php / save_updates.php の置き換え */
function storeName(name: string): StoreName | null {
  return (STORE_NAMES as string[]).includes(name) ? (name as StoreName) : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const name = storeName((await params).name);
  if (!name) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await isStaff(req))) return unauthorized();
  return NextResponse.json(await readStore(name), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const name = storeName((await params).name);
  // students は save-student / save-lesson からだけ書き換える
  if (!name || name === 'students') return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await isStaff(req))) return unauthorized();
  try {
    const data = await req.json();
    if (data === null || typeof data !== 'object') {
      return NextResponse.json({ success: false, error: 'invalid body' }, { status: 400 });
    }
    await writeStore(name, data);
    return NextResponse.json({ success: true });
  } catch (e) {
    await logError('legacy-store', e, { status: 500, context: { name } });
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
