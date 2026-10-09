import { NextRequest, NextResponse } from 'next/server';
import { ensureLegacyTables, getSecret, readStore, type LegacyStudentsDoc } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

/**
 * マイページの「お問い合わせ」。旧版はブラウザから GAS にキー付きで直接送っていた。
 * accessKey が本物の受講生のときだけ、サーバーからキーを付けて GAS へ転送する。
 */
export async function POST(req: NextRequest) {
  const f = await req.formData();
  const accessKey = String(f.get('accessKey') ?? '').trim();
  await ensureLegacyTables();
  const doc = await readStore<LegacyStudentsDoc>('students');
  if (!accessKey || !(doc.students ?? []).some(s => s.accessKey === accessKey)) {
    return NextResponse.json({ success: false }, { status: 403 });
  }
  const url = await getSecret('inquiry_url');
  const key = await getSecret('gas_key');
  if (!url || !key) return NextResponse.json({ success: false }, { status: 500 });
  const out = new FormData();
  out.append('key', key);
  for (const k of ['inputName', 'studentName', 'message']) out.append(k, String(f.get(k) ?? ''));
  const r = await fetch(url, { method: 'POST', body: out, redirect: 'follow' });
  return NextResponse.json({ success: r.ok });
}
