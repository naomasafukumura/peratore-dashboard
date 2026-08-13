import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { buildErrorDigest, MAX_DETAIL } from '@/lib/error-digest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token =
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value ??
    (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const ok = await verifyAdminSession(token);
  if (!ok) return NextResponse.json({ error: '管理者ログインが必要です' }, { status: 401 });
  return null;
}

/**
 * GET — 管理画面から任意タイミングでエラーダイジェストを取得する（Slack送信は行わない）。
 * 集計内容は cron/error-monitor が Slack に送っているものと同じ。
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  let digest;
  try {
    digest = await buildErrorDigest();
  } catch (e) {
    const message = (e as Error).message;
    if (message === 'DATABASE_URL not configured') {
      console.error('[admin/error-digest] DATABASE_URL が未設定です');
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }
    console.error('[admin/error-digest] error_logs取得失敗:', e);
    return NextResponse.json({ error: 'DB取得失敗', detail: message }, { status: 500 });
  }

  if (digest.count === 0) {
    return NextResponse.json({
      ok: true,
      count: 0,
      note: 'no errors',
      target: 'production / 直近24時間',
    });
  }

  return NextResponse.json({
    ok: true,
    count: digest.count,
    appCounts: digest.appCounts,
    sourceCounts: digest.sourceCounts,
    appCountText: digest.appCountText,
    sourceCountText: digest.sourceCountText,
    summary: digest.summary,
    summaryFailed: digest.summaryFailed,
    detailLogs: digest.detailLogs,
    detailText: digest.detailText,
    target: `production / 直近24時間 / 合計${digest.count}件（${digest.appCountInline}） / 詳細は直近${Math.min(digest.count, MAX_DETAIL)}件まで`,
  });
}
