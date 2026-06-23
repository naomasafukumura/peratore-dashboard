import { NextRequest, NextResponse } from 'next/server';
import { readEnvValueFromFiles } from '@/lib/read-env-from-files';
import { sendSlack } from '@/lib/slack-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel API が返すデプロイ情報の最小型 */
interface VercelDeployment {
  name: string;
  state: string;
  createdAt: number;
  url: string;
  inspectorUrl?: string;
}

interface VercelDeploymentsResponse {
  deployments: VercelDeployment[];
}

/** Claude に渡す圧縮済みデプロイ情報 */
interface CompactDeployment {
  name: string;
  state: string;
  createdAt: string; // ISO 文字列
  url: string;
  inspectorUrl: string;
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
  const vercelToken =
    process.env.VERCEL_API_TOKEN ?? readEnvValueFromFiles('VERCEL_API_TOKEN');
  const projectId =
    process.env.VERCEL_PROJECT_ID ?? readEnvValueFromFiles('VERCEL_PROJECT_ID');
  const teamId =
    process.env.VERCEL_TEAM_ID ?? readEnvValueFromFiles('VERCEL_TEAM_ID');
  const openaiKey =
    process.env.OPENAI_API_KEY ?? readEnvValueFromFiles('OPENAI_API_KEY');

  // --- Vercel API で直近 24h の ERROR デプロイ取得 ---
  const since = Date.now() - 86_400_000;
  const vercelUrl =
    `https://api.vercel.com/v6/deployments` +
    `?projectId=${projectId}&teamId=${teamId}&state=ERROR&since=${since}&limit=100`;

  const vercelController = new AbortController();
  const vercelTimeout = setTimeout(() => vercelController.abort(), 15_000);

  let deployments: VercelDeployment[] = [];
  try {
    const vercelRes = await fetch(vercelUrl, {
      headers: { Authorization: `Bearer ${vercelToken}` },
      signal: vercelController.signal,
    });
    clearTimeout(vercelTimeout);

    if (!vercelRes.ok) {
      const errText = await vercelRes.text().catch(() => '');
      throw new Error(`Vercel API ${vercelRes.status}: ${errText}`);
    }

    const data: VercelDeploymentsResponse = await vercelRes.json();
    deployments = data.deployments ?? [];
  } catch (e) {
    clearTimeout(vercelTimeout);
    console.error('[error-monitor] Vercel 取得失敗:', e);

    // Slack に取得失敗を通知して 200 で終了（Cron に再試行させない）
    await sendSlack({
      text: '⚠️ peratore-dashboard: Vercel デプロイ情報の取得に失敗しました',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⚠️ *Vercel 取得失敗*\n${(e as Error).message}`,
          },
        },
      ],
    });
    return NextResponse.json({ ok: true, note: 'vercel fetch failed' });
  }

  // --- エラー 0 件は何もしない ---
  if (deployments.length === 0) {
    return NextResponse.json({ ok: true, note: 'no errors' });
  }

  // --- 直近 20 件に絞って圧縮 ---
  const compact: CompactDeployment[] = deployments
    .slice(0, 20)
    .map((d) => ({
      name: d.name,
      state: d.state,
      createdAt: new Date(d.createdAt).toISOString(),
      url: d.url,
      inspectorUrl: d.inspectorUrl ?? `https://vercel.com/deployments/${d.url}`,
    }));

  // --- OpenAI で要約 ---
  let summary = '';
  let summaryFailed = false;

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
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content:
              '日本語・簡潔・箇条書きで回答してください。各障害を1行で説明し、最後に全体の所感と緊急度（高/中/低）を記述してください。',
          },
          {
            role: 'user',
            content: `以下は peratore-dashboard の直近24時間のデプロイ失敗一覧です。要約してください:\n\n${JSON.stringify(compact, null, 2)}`,
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
    summary = `要約失敗: Vercelデータのみ\n\n${JSON.stringify(compact, null, 2)}`;
  }

  // --- Slack 通知ブロック組み立て ---
  const count = deployments.length;
  const top5 = compact.slice(0, 5);

  const blocks: object[] = [
    // ヘッダー
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚨 peratore-dashboard ${count}件のデプロイ失敗`,
        emoji: true,
      },
    },
    // 要約
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summaryFailed
          ? `*要約*\n${summary}`
          : `*AI 要約*\n${summary}`,
      },
    },
    // 期間・件数フィールド
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*期間*\n直近24時間` },
        { type: 'mrkdwn', text: `*件数*\n${count}件` },
      ],
    },
    // 代表エラーのリンク（最大5件）
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*代表エラー（最大5件）*\n' +
          top5
            .map(
              (d, i) =>
                `${i + 1}. <${d.inspectorUrl}|${d.name}> — ${d.createdAt}`,
            )
            .join('\n'),
      },
    },
    // コンテキスト
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '自動対応なし・手動確認が必要です',
        },
      ],
    },
  ];

  // --- Slack 送信（失敗時のみ 500 を返す） ---
  try {
    await sendSlack({
      text: `🚨 peratore-dashboard で ${count}件のデプロイ失敗`,
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
