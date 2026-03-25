import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL?.trim();

/** Neon の戻り型が union で分割代入と相性が悪いため、行配列として扱う（既存 API は従来どおりプロパティ参照） */
function createSql(connectionString: string) {
  const raw = neon(connectionString);
  return (strings: TemplateStringsArray, ...values: unknown[]) =>
    raw(strings, ...(values as never[])) as Promise<Record<string, any>[]>;
}

/**
 * DATABASE_URL が無いときは neon() を呼ばず、クエリ時に分かりやすく失敗する。
 */
export const sql =
  url != null && url.length > 0
    ? createSql(url)
    : ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
        Promise.reject<Record<string, any>[]>(
          new Error('DATABASE_URL が未設定です。.env.local に Neon の接続文字列を設定してください。')
        ));

export function hasDatabaseUrl(): boolean {
  return Boolean(url && url.length > 0);
}
