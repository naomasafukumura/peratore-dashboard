import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { logError } from '@/lib/error-log';
import updatesSeed from '@/data/tutor-seed/updates.json';
import badgesSeed from '@/data/tutor-seed/badges.json';

export const dynamic = 'force-dynamic';

/**
 * 講師ポータル（public/tutor/）の「お知らせ」「バッジ」。
 * 旧 Xserver の updates-api.php / badges-api.php（JSONファイル読み書き）の置き換えで、
 * リクエスト/レスポンス形式は旧PHPと同じ（GET ?action=get / POST {action:'save', data}）。
 * 初回は Xserver から移した JSON を初期値として返す。
 */
const SEEDS: Record<string, unknown> = { updates: updatesSeed, badges: badgesSeed };

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS tutor_portal_data (
      kind       TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(kind in SEEDS)) return NextResponse.json({ success: false, message: '無効なリクエストです' }, { status: 404 });
  if (req.nextUrl.searchParams.get('action') !== 'get') {
    return NextResponse.json({ success: false, message: '無効なリクエストです' }, { status: 400 });
  }
  try {
    await ensureTable();
    const rows = await sql`SELECT data FROM tutor_portal_data WHERE kind = ${kind}`;
    const data = (rows as { data: unknown }[])[0]?.data ?? SEEDS[kind];
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('tutor GET:', e);
    await logError('tutor-portal', e, { status: 500, context: { method: 'GET', kind } });
    return NextResponse.json({ success: false, message: '読み込みに失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(kind in SEEDS)) return NextResponse.json({ success: false, message: '無効なリクエストです' }, { status: 404 });
  try {
    const body = await req.json();
    if (body?.action !== 'save' || !Array.isArray(body.data)) {
      return NextResponse.json({ success: false, message: '無効なリクエストです' }, { status: 400 });
    }
    await ensureTable();
    const json = JSON.stringify(body.data);
    await sql`
      INSERT INTO tutor_portal_data (kind, data, updated_at)
      VALUES (${kind}, ${json}::jsonb, NOW())
      ON CONFLICT (kind) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;
    return NextResponse.json({ success: true, message: '保存しました' });
  } catch (e) {
    console.error('tutor POST:', e);
    await logError('tutor-portal', e, { status: 500, context: { method: 'POST', kind } });
    return NextResponse.json({ success: false, message: '保存に失敗しました' }, { status: 500 });
  }
}
