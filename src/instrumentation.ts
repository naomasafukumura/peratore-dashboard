/**
 * Next が instrumentation を解決するためのプレースホルダー。
 * `.env.local` は `next.config.ts` の dotenv で読み込む（Node の fs はここに置かない／Edge バンドル衝突を避ける）。
 */
export function register() {
  // no-op
}

/**
 * Next.js 15+ の onRequestError フック。
 * 既存ルートは catch 済みで throw しないため基本二重計上は起きない。
 * Node.js ランタイムでのみ動作（Edge を除外）。
 */
export async function onRequestError(
  error: unknown,
  request: { path: string },
  context: { routeType: string; routePath?: string }
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    // 動的 import（バンドル時に Edge に巻き込まれないよう）
    const { logError } = await import('@/lib/error-log');
    await logError(
      'onRequestError:' + (context.routePath ?? '?'),
      error,
      { context: { routeType: context.routeType, path: request.path } }
    );
  } catch {
    // instrumentation から例外を外に出さない
  }
}
