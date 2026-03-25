'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function StudentSettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/student/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user && 'assignmentName' in session.user) {
      setValue((session.user as { assignmentName?: string | null }).assignmentName ?? '');
    }
  }, [session]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center text-text-muted text-sm">
        読み込み中…
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setErr('受講生名を入力してください');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/student/assignment-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentName: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || '保存に失敗しました');
        return;
      }
      await update();
      setMsg('保存しました。練習画面を開くと個別教材が追加表示されます。');
    } catch {
      setErr('通信エラー');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page px-4 py-8 max-w-md mx-auto">
      <Link href="/student" className="text-xs text-primary mb-4 inline-block">
        ← マイページ
      </Link>
      <h1 className="text-lg font-bold text-text-dark mt-2">受講生名の設定</h1>
      <p className="text-xs text-text-muted mt-2">
        先生がレッスン後フォームのプルダウンで選んでいる名前と<strong>同じ表記</strong>にしてください（空白・漢字も含め一致が必要です）。
      </p>
      <form onSubmit={save} className="mt-6 space-y-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: 山田太郎"
          className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-xl text-sm"
        />
        {err && <p className="text-xs text-error">{err}</p>}
        {msg && <p className="text-xs text-text-muted">{msg}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold disabled:opacity-40"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </form>
    </div>
  );
}
