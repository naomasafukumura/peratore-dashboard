import { NextRequest, NextResponse } from 'next/server';
import { readEnvValueFromFiles } from '@/lib/read-env-from-files';
import { sendSlack } from '@/lib/slack-notify';
import { sql, hasDatabaseUrl } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** error_logs テーブルの1行 */
interface ErrorLog {
  id: string;
  created_at: string;
  source: string;
  level: string;
  message: string;
  stack: string | null;
  status: number | null;
  student_name: string | null;
  context: Record<string, unknown> | null;
  env: string;
}

/** UTC → JST の表示文字列（例: "06/23 08:12"） */
function toJst(isoStr: string): string {
  const d = new Date(isoStr);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mi = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export async function GET(req: NextRequest) {
  // --- 認証チェック ---
  const cronSecret =
    process.env.CRON_SECRET ?? readEnvValueFromFiles('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- テスト送信モード（?test=1）: Slack 疎通確認用にサンプル1通を送る ---
  if (req.nextUrl.searchParams.get('test') === '1') {
    try {
      await sendSlack({
        text: '✅ peratore-dashboard 監視テスト: Slack 疎通OK',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '✅ *監視テスト*\nこれはエラー監視cronのSlack疎通確認メッセージです。届いていれば設定は正常です。',
            },
          },
        ],
      });
      return NextResponse.json({ ok: true, note: 'test slack sent' });
    } catch (e) {
      console.error('[error-monitor] テスト送信失敗:', e);
      return NextResponse.json(
        { error: 'test slack failed', detail: (e as Error).message },
        { status: 500 },
      );
    }
  }

  // --- 環境変数取得 ---
  const openaiKey =
    process.env.OPENAI_API_KEY ?? readEnvValueFromFiles('OPENAI_API_KEY');

  // --- DB から直近 24h のエラーを取得 ---
  if (!hasDatabaseUrl()) {
    console.error('[error-monitor] DATABASE_URL が未設定です');
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
  }

  let logs: ErrorLog[] = [];
  try {
    logs = (await sql`
      SELECT id, created_at, source, level, message, stack, status, student_name, context, env
      FROM error_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND env = 'production'
      ORDER BY created_at DESC
    `) as ErrorLog[];
  } catch (e) {
    console.error('[error-monitor] error_logs取得失敗:', e);
    return NextResponse.json(
      { error: 'DB取得失敗', detail: (e as Error).message },
      { status: 500 },
    );
  }

  // --- エラー 0 件は何もしない ---
  if (logs.length === 0) {
    return NextResponse.json({ ok: true, note: 'no errors' });
  }

  const count = logs.length;

  // --- source 別件数の集計 ---
  const sourceCounts: Record<string, number> = {};
  for (const log of logs) {
    sourceCounts[log.source] = (sourceCounts[log.source] ?? 0) + 1;
  }
  const sourceCountText = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `• ${src}: ${n}件`)
    .join('\n');

  // --- 詳細一覧（最大15件） ---
  const MAX_DETAIL = 15;
  const detailLogs = logs.slice(0, MAX_DETAIL);
  const remaining = count - detailLogs.length;
  const detailLines = detailLogs.map((log) => {
    const time = toJst(log.created_at);
    const status = log.status ? ` ${log.status}` : '';
    const student = log.student_name ? ` （受講生: ${log.student_name}）` : '';
    return `[${time} JST] ${log.source}${status} — ${log.message}${student}`;
  });
  if (remaining > 0) {
    detailLines.push(`他 ${remaining} 件`);
  }
  const detailText = detailLines.join('\n');

  // --- OpenAI で要約 ---
  let summary = '';
  let summaryFailed = false;

  const aiSummaryInput = {
    totalCount: count,
    sourceCounts,
    sampleMessages: logs.slice(0, 10).map((l) => ({
      source: l.source,
      message: l.message,
      status: l.status,
    })),
  };

  const aiController = new AbortController();
  const aiTimeout = setTimeout(() => aiController.abort(), 30_000);
  try {
    if (!openaiKey) throw new Error('OPENAI_API_KEY が未設定');

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 512,
        messages: [
          {
            role: 'system',
            content:
              'アプリ実行時エラーのダイジェストを日本語・簡潔・箇条書きで作成してください。source別件数・傾向・緊急度(高/中/低)を記述してください。',
          },
          {
            role: 'user',
            content: `以下は peratore-dashboard の直近24時間のアプリ実行時エラー集計です。要約してください:\n\n${JSON.stringify(aiSummaryInput, null, 2)}`,
          },
        ],
      }),
      signal: aiController.signal,
    });
    clearTimeout(aiTimeout);

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      throw new Error(`OpenAI API ${aiRes.status}: ${errText}`);
    }

    const data: { choices?: { message?: { content?: string } }[] } =
      await aiRes.json();
    summary = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!summary) throw new Error('OpenAI 応答が空');
  } catch (e) {
    clearTimeout(aiTimeout);
    console.error('[error-monitor] OpenAI 要約失敗:', e);
    summaryFailed = true;
    summary = `要約スキップ（AI呼び出し失敗）`;
  }

  // --- Slack ブロック組み立て ---
  const blocks: object[] = [
    // ヘッダー
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `⚠️ ペラトレ 前日のエラー ${count}件`,
        emoji: true,
      },
    },
    // AI 要約
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summaryFailed
          ? `*要約*\n${summary}`
          : `*AI 要約*\n${summary}`,
      },
    },
    // source 別件数
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*source 別件数*\n${sourceCountText}`,
      },
    },
    // 詳細一覧（生ログ相当）
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        // Slack の section text は 3000 文字制限
        text: `*詳細一覧（直近${Math.min(count, MAX_DETAIL)}件）*\n\`\`\`${detailText.slice(0, 2800)}\`\`\``,
      },
    },
    // コンテキスト
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `対象: production / 直近24時間 / 合計${count}件`,
        },
      ],
    },
  ];

  // --- Slack 送信 ---
  try {
    await sendSlack({
      text: `⚠️ ペラトレ で前日 ${count}件のエラー`,
      blocks,
    });
  } catch (e) {
    console.error('[error-monitor] Slack 送信失敗:', e);
    return NextResponse.json(
      { error: 'Slack 送信失敗', detail: (e as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, count });
}
