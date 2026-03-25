'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function TeacherLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';

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
      router.push(nextPath.startsWith('/') ? nextPath : '/');
      router.refresh();
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
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            autoComplete="current-password"
            className="w-full px-3 py-2.5 bg-bg-page border border-border rounded-xl text-sm"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            {loading ? '確認中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
