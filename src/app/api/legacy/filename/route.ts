import { NextRequest, NextResponse } from 'next/server';
import { isStaff, unauthorized } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

/** 旧 myportal/get_filename.php の置き換え。Google ドライブ/ドキュメントのページタイトルからファイル名を取る */
export async function GET(req: NextRequest) {
  if (!(await isStaff(req))) return unauthorized();
  const url = req.nextUrl.searchParams.get('url') ?? '';
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  if (host !== 'drive.google.com' && host !== 'docs.google.com') {
    return NextResponse.json({ success: false });
  }
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await r.text();
    const m = html.match(/<title>([^<]*)<\/title>/i);
    const filename = (m?.[1] ?? '')
      .replace(/\s*-\s*Google (ドライブ|Drive|ドキュメント|Docs|スプレッドシート|Sheets|スライド|Slides)\s*$/i, '')
      .replace(/&amp;/g, '&').trim();
    if (!filename || /^(Google (ドライブ|Drive)|ログイン|Sign-in|Meet)/i.test(filename)) return NextResponse.json({ success: false });
    return NextResponse.json({ success: true, filename });
  } catch {
    return NextResponse.json({ success: false });
  }
}
