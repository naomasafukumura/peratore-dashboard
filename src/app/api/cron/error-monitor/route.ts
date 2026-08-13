import { NextRequest, NextResponse } from 'next/server';
import { readEnvValueFromFiles } from '@/lib/read-env-from-files';
import { sendSlack } from '@/lib/slack-notify';
import { buildErrorDigest, MAX_DETAIL } from '@/lib/error-digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // --- DB取得→集計→AI要約 ---
  let digest;
  try {
    digest = await buildErrorDigest();
  } catch (e) {
    const message = (e as Error).message;
    if (message === 'DATABASE_URL not configured') {
      console.error('[error-monitor] DATABASE_URL が未設定です');
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }
    console.error('[error-monitor] error_logs取得失敗:', e);
    return NextResponse.json({ error: 'DB取得失敗', detail: message }, { status: 500 });
  }

  // --- エラー 0 件は何もしない ---
  if (digest.count === 0) {
    return NextResponse.json({ ok: true, note: 'no errors' });
  }

  const { count, appCountText, sourceCountText, appCountInline, detailText, summary, summaryFailed } =
    digest;

  // --- Slack ブロック組み立て ---
  const blocks: object[] = [
    // ヘッダー
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `⚠️ 前日のエラー ${count}件（${appCountInline}）`,
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
    // アプリ別件数
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*アプリ別件数*\n${appCountText}`,
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
          text: `対象: production / 直近24時間 / 合計${count}件（${appCountInline}）\n※ パターンプラクティスは匿名利用のため受講生の特定はできません`,
        },
      ],
    },
  ];

  // --- Slack 送信 ---
  try {
    await sendSlack({
      text: `⚠️ 前日 ${count}件のエラー（${appCountInline}）`,
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
