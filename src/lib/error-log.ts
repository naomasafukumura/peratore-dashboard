import { sql, hasDatabaseUrl } from '@/lib/db';

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
  } catch (dbErr) {
    console.error('[error-log] DB書き込み失敗:', dbErr);
  }
}
