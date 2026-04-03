'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

type Props = { initialGateEnabled: boolean };

export default function TeacherLoginForm({ initialGateEnabled }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/teacher';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/teacher-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ログインに失敗しました');
        return;
      }
      window.location.replace(nextPath.startsWith('/') ? nextPath : '/teacher');
    } catch {
      setError('通信エラー');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-bg-card border border-border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
        <h1 className="text-lg font-bold text-text-dark">先生用ログイン</h1>
        <p className="text-xs text-text-muted mt-2 mb-4">
          レッスン後フォーム・先生ダッシュボード用です。パスワードは管理者が設定します。
        </p>

        {!initialGateEnabled && (
          <div className="mb-4 rounded-xl border border-amber-bd bg-amber-bg p-3 text-[11px] text-amber leading-relaxed">
            <p className="font-semibold text-text-dark mb-1">サーバーが TEACHER_PASSWORD を読めていません</p>
            <p>
              パスワードを入れてもログインできません。次を確認してください。
            </p>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li>
                ファイル名が正確に <code className="text-[10px]">.env.local</code>（
                <strong className="text-text-dark">.txt が付いていない</strong>こと）
              </li>
              <li>
                置き場所は <code className="text-[10px]">package.json</code> がある{' '}
                <strong className="text-text-dark">リポジトリの直下</strong>（そのフォルダで{' '}
                <code className="text-[10px]">npm run dev</code> する想定）。ひとつ上の親フォルダだけに置くと読まれない
              </li>
              <li>
                行は先頭から <code className="text-[10px]">TEACHER_PASSWORD=</code>（行頭スペースなし・全角＝禁止）
              </li>
              <li>
                保存後に <code className="text-[10px]">npm run dev</code> を止めて再起動
              </li>
              <li>本番（Vercel）ならダッシュボードの Environment Variables に追加して再デプロイ</li>
            </ul>
            <p className="mt-2">
              ゲート無効時はパスワード不要でフォームを開けます。→{' '}
              <Link href="/" className="font-medium text-primary underline">
                レッスン後フォームへ
              </Link>
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            autoComplete="current-password"
            disabled={!initialGateEnabled}
            className="w-full px-3 py-2.5 bg-bg-page border border-border rounded-xl text-sm disabled:opacity-50"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password || !initialGateEnabled}
            className="w-full py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            {loading ? '確認中…' : 'ログイン'}
          </button>
        </form>
      </div>
      <p className="mt-4 text-xs text-text-muted">
        管理者ログインは
        <Link href="/teacher/admin/login" className="text-primary underline ml-1">こちら</Link>
      </p>
    </div>
  );
}
