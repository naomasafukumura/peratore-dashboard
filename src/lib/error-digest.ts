import { readEnvValueFromFiles } from '@/lib/read-env-from-files';
import { sql, hasDatabaseUrl } from '@/lib/db';

/** error_logs テーブルの1行 */
export interface ErrorLog {
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

/** buildErrorDigest() の戻り値 */
export interface ErrorDigest {
  logs: ErrorLog[];
  count: number;
  appCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  appCountText: string;
  sourceCountText: string;
  appCountInline: string;
  detailLogs: ErrorLog[];
  detailText: string;
  summary: string;
  summaryFailed: boolean;
}

/** 詳細一覧に含める最大件数 */
export const MAX_DETAIL = 15;

/**
 * source からアプリ名を判定する。
 * パターンプラクティスは自前DBを持たないため、`patternpractice:` 接頭辞付きで
 * このアプリの error_logs に相乗りしている（peratore-dashboard/src/app/api/client-error）。
 */
export function appOf(source: string): string {
  return source.startsWith('patternpractice:') ? 'パターンプラクティス' : 'ペラトレ';
}

/** UTC → JST の表示文字列（例: "06/23 08:12"） */
export function toJst(isoStr: string): string {
  const d = new Date(isoStr);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mi = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

/**
 * error_logs から直近24h・env=production のエラーを取得し、
 * source別/アプリ別集計・詳細一覧・OpenAI要約までをまとめて返す。
 * DATABASE_URL 未設定・DB取得失敗時は例外を throw する（呼び出し側で 500 に変換する）。
 */
export async function buildErrorDigest(): Promise<ErrorDigest> {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL not configured');
  }

  const logs = (await sql`
    SELECT id, created_at, source, level, message, stack, status, student_name, context, env
    FROM error_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND env = 'production'
    ORDER BY created_at DESC
  `) as ErrorLog[];

  const count = logs.length;

  // --- source 別 / アプリ別件数の集計 ---
  const sourceCounts: Record<string, number> = {};
  const appCounts: Record<string, number> = {};
  for (const log of logs) {
    sourceCounts[log.source] = (sourceCounts[log.source] ?? 0) + 1;
    const app = appOf(log.source);
    appCounts[app] = (appCounts[app] ?? 0) + 1;
  }
  const sourceCountText = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `• ${src}: ${n}件`)
    .join('\n');
  const appCountText = Object.entries(appCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([app, n]) => `• ${app}: ${n}件`)
    .join('\n');
  const appCountInline = Object.entries(appCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([app, n]) => `${app} ${n}`)
    .join(' / ');

  // --- 詳細一覧（最大 MAX_DETAIL 件） ---
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

  // --- エラー 0 件なら要約はスキップ ---
  if (count === 0) {
    return {
      logs,
      count,
      appCounts,
      sourceCounts,
      appCountText,
      sourceCountText,
      appCountInline,
      detailLogs,
      detailText,
      summary: '',
      summaryFailed: false,
    };
  }

  // --- OpenAI で要約 ---
  const openaiKey =
    process.env.OPENAI_API_KEY ?? readEnvValueFromFiles('OPENAI_API_KEY');

  let summary = '';
  let summaryFailed = false;

  const aiSummaryInput = {
    totalCount: count,
    appCounts,
    sourceCounts,
    sampleMessages: logs.slice(0, 10).map((l) => ({
      app: appOf(l.source),
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
              'アプリ実行時エラーのダイジェストを日本語・簡潔・箇条書きで作成してください。アプリ別件数・source別件数・傾向・緊急度(高/中/低)を記述してください。',
          },
          {
            role: 'user',
            content: `以下は「ペラトレ」と「パターンプラクティス」2アプリの直近24時間の実行時エラー集計です。source が patternpractice: で始まるものがパターンプラクティス、それ以外がペラトレです。要約してください:\n\n${JSON.stringify(aiSummaryInput, null, 2)}`,
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
    console.error('[error-digest] OpenAI 要約失敗:', e);
    summaryFailed = true;
    summary = `要約スキップ（AI呼び出し失敗）`;
  }

  return {
    logs,
    count,
    appCounts,
    sourceCounts,
    appCountText,
    sourceCountText,
    appCountInline,
    detailLogs,
    detailText,
    summary,
    summaryFailed,
  };
}
