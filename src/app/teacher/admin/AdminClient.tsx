'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type DeletionRequest = {
  id: number;
  student_name: string;
  note: string | null;
  requested_at: string;
};

type DeletedStudent = {
  student_name: string;
  deleted_at: string;
};

export default function AdminClient() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [deleted, setDeleted] = useState<DeletedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [reqRes, delRes] = await Promise.all([
        fetch('/api/admin/deletion-requests', { credentials: 'include' }),
        fetch('/api/admin/restore', { credentials: 'include' }),
      ]);
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequests(data.requests ?? []);
      }
      if (delRes.ok) {
        const data = await delRes.json();
        setDeleted(data.deleted ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handle = async (id: number, action: 'approve' | 'reject') => {
    const label = action === 'approve' ? '承認（削除実行）' : '却下';
    if (!confirm(`この依頼を${label}しますか？`)) return;
    setProcessing(id);
    try {
      const res = await fetch('/api/admin/deletion-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(`エラー: ${data.error}`); return; }
      setMessage(action === 'approve'
        ? `「${data.studentName}」を削除しました`
        : `「${data.studentName}」の依頼を却下しました`
      );
      setRequests(prev => prev.filter(r => r.id !== id));
      if (action === 'approve') {
        const delRes = await fetch('/api/admin/restore', { credentials: 'include' });
        if (delRes.ok) { const d = await delRes.json(); setDeleted(d.deleted ?? []); }
      }
    } finally {
      setProcessing(null);
    }
  };

  const restore = async (studentName: string) => {
    if (!confirm(`「${studentName}」を復元しますか？`)) return;
    setProcessing(studentName);
    try {
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(`エラー: ${data.error}`); return; }
      setMessage(`「${data.studentName}」を復元しました`);
      setDeleted(prev => prev.filter(d => d.student_name !== studentName));
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-bg-page">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-text-dark">管理者：削除依頼</h1>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <a href="/teacher" className="text-primary font-medium">ダッシュボード</a>
            <a href="/api/admin-auth/logout" className="text-text-muted hover:text-text-dark">ログアウト</a>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5">
        {message && (
          <div className="mb-4 p-3 rounded-xl bg-bg-card border border-border text-sm text-text-dark">
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-text-muted text-center py-12">読み込み中…</p>
        ) : (
          <>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">削除依頼</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-text-muted py-4">削除依頼はありません</p>
            ) : (
              <div className="space-y-3 mb-8">
                {requests.map(r => (
                  <div key={r.id} className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-dark">{r.student_name}</p>
                        {r.note && <p className="text-xs text-text-muted mt-1">{r.note}</p>}
                        <p className="text-[10px] text-text-muted mt-1">{formatDate(r.requested_at)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handle(r.id, 'reject')}
                          disabled={processing === r.id}
                          className="px-3 py-1.5 border border-border rounded-[var(--radius-button)] text-xs text-text-muted hover:text-text-dark disabled:opacity-40"
                        >
                          却下
                        </button>
                        <button
                          onClick={() => handle(r.id, 'approve')}
                          disabled={processing === r.id}
                          className="px-3 py-1.5 bg-error text-white rounded-[var(--radius-button)] text-xs font-semibold disabled:opacity-40"
                        >
                          {processing === r.id ? '処理中…' : '削除承認'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 mt-6">削除済み（復元可能）</h2>
            {deleted.length === 0 ? (
              <p className="text-sm text-text-muted py-4">削除済みの受講生はいません</p>
            ) : (
              <div className="space-y-3">
                {deleted.map(d => (
                  <div key={d.student_name} className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-dark">{d.student_name}</p>
                        <p className="text-[10px] text-text-muted mt-1">削除日: {formatDate(d.deleted_at)}</p>
                      </div>
                      <button
                        onClick={() => restore(d.student_name)}
                        disabled={processing === d.student_name}
                        className="px-3 py-1.5 bg-success text-white rounded-[var(--radius-button)] text-xs font-semibold disabled:opacity-40 shrink-0"
                      >
                        {processing === d.student_name ? '処理中…' : '復元'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
