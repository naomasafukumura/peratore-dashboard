'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/teacher/admin';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'ログイン失敗'); return; }
      window.location.href = nextPath.startsWith('/') ? nextPath : '/teacher/admin';
    } catch {
      setError('通信エラー');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-bg-card border border-border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
        <h1 className="text-lg font-bold text-text-dark">管理者ログイン</h1>
        <p className="text-xs text-text-muted mt-2 mb-4">削除依頼の承認・却下ができます。</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="管理者パスワード"
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

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-page flex items-center justify-center text-sm text-text-muted">読み込み中…</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
