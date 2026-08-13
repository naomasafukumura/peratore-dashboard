import { NextRequest, NextResponse } from 'next/server';
import { readEnvValueFromFiles } from '@/lib/read-env-from-files';
import { sql, hasDatabaseUrl } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const RECENT_LIMIT = 50;

/**
 * イベント階層マップ。
 *
 * mic-error.js / mic-stats.js の ERROR_EVENTS（「転送・集計してよい事象」）とは別軸で、
 * ここでは「転送済みの事象を、実害の重さでどう分類するか」を決める。
 * 新しいイベントを追加するときは、まず masaenglish-patternpractice/api/mic-error.js の
 * ERROR_EVENTS に載っているか確認したうえで、ここに分類を足すこと。載っていないイベントは
 * そもそも転送されないのでここには現れない。
 */
const TIER_MAP: Record<string, 'blocking' | 'degraded' | 'infra'> = {
  // blocking: 受講生から見て「音が出ない/録音できない」が確定した実害
  audio_silent_confirmed: 'blocking',
  mic_error: 'blocking',
  play_fail: 'blocking',
  audio_error: 'blocking',
  // degraded: 自己回復や読み直しでリカバリしうる中間シグナル
  record_neutralized: 'degraded',
  transcribe_http_error: 'degraded',
  transcribe_request_failed: 'degraded',
  audio_failsafe: 'degraded',
  stop_recognition_failsafe: 'degraded',
  // infra: アプリ基盤側の異常（受講生の操作起因ではない）
  server_error: 'infra',
  prewarm_fail: 'infra',
};
const TIERS = ['blocking', 'degraded', 'infra', 'other'] as const;
type Tier = (typeof TIERS)[number];

function tierOf(event: string): Tier {
  return TIER_MAP[event] ?? 'other';
}

/** source（'patternpractice:mic_error' 等）からイベント名を取り出す */
function eventOf(source: string): string {
  const prefix = 'patternpractice:';
  return source.startsWith(prefix) ? source.slice(prefix.length) : source;
}

/** ISO文字列 → Asia/Tokyo の日付文字列（YYYY-MM-DD）。JSTはDSTが無いのでUTC+9固定でよい */
function jstDateStr(iso: string): string {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

interface ErrorLogRow {
  id: string;
  created_at: string;
  source: string;
  message: string;
  status: number | null;
  context: Record<string, unknown> | null;
}

/**
 * GET /api/stats/patternpractice
 * パターンプラクティスの実害件数を、Slackの日次通知を待たずに確認するための読み取り専用API。
 * masaenglish-patternpractice/api/error-stats.js から Bearer トークン付きで中継される。
 *
 * クエリ: days（既定7・上限90） / event（sourceの接尾辞で絞り込み） / recent（1で直近ログも返す）
 */
export async function GET(req: NextRequest) {
  // --- 認証チェック（CRON_SECRET とは別目的のトークンなので流用しない） ---
  const token = process.env.PP_STATS_TOKEN ?? readEnvValueFromFiles('PP_STATS_TOKEN');
  const authHeader = req.headers.get('Authorization');
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const daysRaw = parseInt(sp.get('days') ?? '', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, MAX_DAYS) : DEFAULT_DAYS;
  const eventFilter = (sp.get('event') || '').slice(0, 64) || undefined;
  const wantRecent = sp.get('recent') === '1';

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    // event 指定時は source を完全一致に絞る。未指定時は patternpractice: 全体。
    const rows = (eventFilter
      ? await sql`
          SELECT id, created_at, source, message, status, context
          FROM error_logs
          WHERE source = ${`patternpractice:${eventFilter}`}
            AND env = 'production'
            AND created_at >= ${since.toISOString()}
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT id, created_at, source, message, status, context
          FROM error_logs
          WHERE source LIKE 'patternpractice:%'
            AND env = 'production'
            AND created_at >= ${since.toISOString()}
          ORDER BY created_at DESC
        `) as ErrorLogRow[];

    const total = rows.length;
    const byEvent: Record<string, number> = {};
    const tiers: Record<Tier, Record<string, number>> = {
      blocking: {},
      degraded: {},
      infra: {},
      other: {},
    };
    const byDayMap = new Map<string, { total: number; byEvent: Record<string, number> }>();

    for (const row of rows) {
      const event = eventOf(row.source);
      byEvent[event] = (byEvent[event] ?? 0) + 1;

      const tier = tierOf(event);
      tiers[tier][event] = (tiers[tier][event] ?? 0) + 1;

      const day = jstDateStr(row.created_at);
      if (!byDayMap.has(day)) byDayMap.set(day, { total: 0, byEvent: {} });
      const bucket = byDayMap.get(day)!;
      bucket.total += 1;
      bucket.byEvent[event] = (bucket.byEvent[event] ?? 0) + 1;
    }

    const byDay = Array.from(byDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, total: v.total, byEvent: v.byEvent }));

    const headlineBlocking = Object.values(tiers.blocking).reduce((a, b) => a + b, 0);

    const result: Record<string, unknown> = {
      windowDays: days,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      total,
      headline: { blocking: headlineBlocking },
      tiers,
      byEvent,
      byDay,
    };

    if (wantRecent) {
      // rows は created_at DESC 済みなので先頭から取るだけでよい
      result.recent = rows.slice(0, RECENT_LIMIT).map((r) => ({
        id: r.id,
        ts: r.created_at,
        event: eventOf(r.source),
        message: r.message,
        status: r.status,
        context: r.context,
      }));
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[stats/patternpractice] DB取得失敗:', e);
    return NextResponse.json(
      { error: 'DB取得失敗', detail: (e as Error).message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
