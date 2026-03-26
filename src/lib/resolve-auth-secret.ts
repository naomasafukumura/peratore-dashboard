import { readFirstMatchingEnvFromFiles } from '@/lib/read-env-from-files';

/** Vercel 本番には .env が無い想定。自前サーバでは .env を置ける。 */
function readSecretFromEnvFiles(): string | undefined {
  return readFirstMatchingEnvFromFiles(['AUTH_SECRET', 'NEXTAUTH_SECRET']);
}

/**
 * Turbopack が `process.env.AUTH_SECRET` をバンドル時に空に置き換えることがあるため、
 * ドット記法ではなく実行時参照に近い形で読む（それでも無ければファイルへ）。
 */
function readAuthSecretFromProcessEnv(): string | undefined {
  const pick = (key: string): string | undefined => {
    const v = Reflect.get(process.env, key);
    return typeof v === 'string' ? v.trim() || undefined : undefined;
  };
  return pick('AUTH_SECRET') ?? pick('NEXTAUTH_SECRET');
}

/** 開発専用。本番では絶対に使わない（Vercel は必ず AUTH_SECRET を設定）。 */
const DEV_INSECURE_FALLBACK =
  'dev-only-peratore-insecure-secret-set-AUTH_SECRET-in-env-local';

function allowInsecureDevFallback(): boolean {
  if (process.env.VERCEL === '1') {
    return false;
  }
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (process.env.npm_lifecycle_event === 'dev') {
    return true;
  }
  return process.argv.includes('dev');
}

/**
 * Auth.js の `secret`。空文字は未設定扱い。
 * 1) 実環境の process.env（プラットフォームの AUTH_SECRET 優先）
 * 2) `.env.local` 直読み（Turbopack で env が空にされるローカル向け）
 * 3) dev のみフォールバック
 */
export function resolveAuthSecret(): string | undefined {
  const fromEnv = readAuthSecretFromProcessEnv();
  if (fromEnv) {
    return fromEnv;
  }
  const fromFile = readSecretFromEnvFiles();
  if (fromFile) {
    return fromFile;
  }
  if (allowInsecureDevFallback()) {
    console.warn(
      '[auth] AUTH_SECRET が見つからないため一時フォールバックを使用しています（npm run dev 向け）。.env.local に AUTH_SECRET= を設定してください。'
    );
    return DEV_INSECURE_FALLBACK;
  }
  return undefined;
}
