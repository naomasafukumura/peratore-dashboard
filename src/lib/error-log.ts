import { sql, hasDatabaseUrl } from '@/lib/db';
import { sendSlack } from '@/lib/slack-notify';

/**
 * アプリ実行時エラーを error_logs テーブルに記録するヘルパー。
 * DB書き込み失敗でも例外を throw しない（本処理を壊さない）。
 * DATABASE_URL 未設定の場合は即 return。
 */
export async function logError(
  source: string,
  error: unknown,
  opts?: { status?: number; studentName?: string; context?: Record<string, unknown> }
): Promise<void> {
  if (!hasDatabaseUrl()) return;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  try {
    await sql`
      INSERT INTO error_logs (source, message, stack, status, student_name, context, env)
      VALUES (
        ${source},
        ${message},
        ${stack},
        ${opts?.status ?? null},
        ${opts?.studentName ?? null},
        ${opts?.context ? JSON.stringify(opts.context) : null},
        ${process.env.NODE_ENV ?? 'production'}
      )
    `;

    // INSERT 成功後: 429/401 の即時 Slack アラート
    const status = opts?.status;
    if (
      (status === 429 || status === 401) &&
      (process.env.NODE_ENV ?? 'production') === 'production'
    ) {
      try {
        const recent = await sql`
          SELECT count(*)::int AS n
          FROM error_logs
          WHERE status = ${status}
            AND created_at >= NOW() - INTERVAL '10 minutes'
        `;
        if (recent[0].n <= 1) {
          const statusLabel =
            status === 429
              ? 'OpenAI 429 (残高不足/レート超過)'
              : 'OpenAI 401 (APIキー無効)';
          await sendSlack({
            text: `🚨 即時アラート: ${statusLabel} (${source})`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🚨 *即時アラート* — ${statusLabel}\n*source:* ${source}\n*message:* ${message.slice(0, 300)}\n\n受講生のアプリが動かない可能性があります。OpenAIのキー残高/有効性を確認してください。`,
                },
              },
            ],
          });
        }
      } catch (alertErr) {
        console.error('[error-log] 即時アラート送信失敗:', alertErr);
      }
    }
  } catch (dbErr) {
    console.error('[error-log] DB書き込み失敗:', dbErr);
  }
}
