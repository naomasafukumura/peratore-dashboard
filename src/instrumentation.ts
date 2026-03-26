/**
 * Next が instrumentation を解決するためのプレースホルダー。
 * `.env.local` は `next.config.ts` の dotenv で読み込む（Node の fs はここに置かない／Edge バンドル衝突を避ける）。
 */
export function register() {
  // no-op
}
