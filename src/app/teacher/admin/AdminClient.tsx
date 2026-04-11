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

type StudentEntry = { name: string; yomi: string; displayName: string };

export default function AdminClient() {
  // --- 削除依頼 ---
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [deleted, setDeleted] = useState<DeletedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // --- 受講生管理 ---
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [stuLoading, setStuLoading] = useState(true);
  const [stuQuery, setStuQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editYomi, setEditYomi] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newYomi, setNewYomi] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [stuMessage, setStuMessage] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [reqRes, delRes] = await Promise.all([
        fetch('/api/admin/deletion-requests', { credentials: 'include' }),
        fetch('/api/admin/restore', { credentials: 'include' }),
      ]);
      if (reqRes.ok) { const data = await reqRes.json(); setRequests(data.requests ?? []); }
      if (delRes.ok) { const data = await delRes.json(); setDeleted(data.deleted ?? []); }
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    setStuLoading(true);
    try {
      const res = await fetch('/api/admin/students', { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setStudents(data.students ?? []); }
    } finally {
      setStuLoading(false);
    }
  };

  useEffect(() => { fetchAll(); fetchStudents(); }, []);

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

  const handleAddStudent = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (students.some(s => s.name === trimmed)) { setAddError('すでに登録済みです'); return; }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, yomi: newYomi.trim(), displayName: newDisplayName.trim() }),
      });
      if (!res.ok) { const j = await res.json(); setAddError(j.error || '追加に失敗しました'); return; }
      setStudents(prev => [...prev, { name: trimmed, yomi: newYomi.trim(), displayName: newDisplayName.trim() }]
        .sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, 'ja')));
      setNewName(''); setNewYomi(''); setNewDisplayName('');
      setStuMessage(`「${trimmed}」を追加しました`);
    } catch { setAddError('追加に失敗しました'); }
    finally { setAdding(false); }
  };

  const startEdit = (s: StudentEntry) => {
    setEditing(s.name);
    setEditName(s.name);
    setEditYomi(s.yomi);
    setEditDisplayName(s.displayName);
    setRenameError(null);
  };

  const cancelEdit = () => { setEditing(null); setRenameError(null); };

  const saveEdit = async (oldName: string) => {
    const next = editName.trim();
    if (!next) { cancelEdit(); return; }
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch('/api/admin/students/rename', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName: next, yomi: editYomi.trim(), displayName: editDisplayName.trim() }),
      });
      if (!res.ok) { const d = await res.json(); setRenameError(d.error || '更新失敗'); return; }
      setStudents(prev =>
        prev.map(s => s.name === oldName ? { name: next, yomi: editYomi.trim(), displayName: editDisplayName.trim() } : s)
          .sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, 'ja'))
      );
      cancelEdit();
      setStuMessage(`「${next}」に更新しました`);
    } catch (e) { setRenameError((e as Error).message); }
    finally { setRenaming(false); }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`「${name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
    setDeletingName(name);
    try {
      const res = await fetch('/api/admin/students/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) { const d = await res.json(); setStuMessage(`エラー: ${d.error}`); return; }
      setStudents(prev => prev.filter(s => s.name !== name));
      setStuMessage(`「${name}」を削除しました`);
    } finally { setDeletingName(null); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
  };

  const filteredStudents = stuQuery.trim()
    ? students.filter(s => s.name.includes(stuQuery.trim()) || s.yomi.includes(stuQuery.trim()))
    : students;

  return (
    <div className="min-h-screen bg-bg-page">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-bold text-text-dark">管理者ページ</h1>
          <div className="flex items-center gap-3 text-xs">
            <a href="/teacher/students" className="text-primary font-medium">受講生一覧</a>
            <a href="/teacher" className="text-primary font-medium">ダッシュボード</a>
            <a href="/api/admin-auth/logout" className="text-text-muted hover:text-text-dark">ログアウト</a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-10">

        {/* ========== 受講生管理 ========== */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">受講生管理</h2>

          {stuMessage && (
            <div className="mb-3 p-3 rounded-xl bg-bg-card border border-border text-sm text-text-dark flex items-center justify-between">
              <span>{stuMessage}</span>
              <button onClick={() => setStuMessage(null)} className="text-text-muted text-xs ml-3">✕</button>
            </div>
          )}

          {/* 受講生追加 */}
          <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] mb-4">
            <p className="text-xs font-semibold text-text-dark mb-2">受講生追加</p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <p className="text-[10px] text-text-muted mb-1">氏名</p>
                <input
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setAddError(null); }}
                  placeholder="例：佐藤妙"
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder:text-text-light focus:outline-none focus:border-primary/40"
                />
              </div>
              <div>
                <p className="text-[10px] text-text-muted mb-1">ふりがな</p>
                <input
                  value={newYomi}
                  onChange={e => setNewYomi(e.target.value)}
                  placeholder="例：さとうたえ"
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder:text-text-light focus:outline-none focus:border-primary/40"
                />
              </div>
              <div>
                <p className="text-[10px] text-text-muted mb-1">専用ページ名</p>
                <input
                  value={newDisplayName}
                  onChange={e => setNewDisplayName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
                  placeholder="例：妙さん"
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder:text-text-light focus:outline-none focus:border-primary/40"
                />
              </div>
            </div>
            <button
              onClick={handleAddStudent}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 bg-primary text-text-dark rounded-[var(--radius-button)] text-xs font-semibold disabled:opacity-40"
            >
              {adding ? '追加中…' : '追加'}
            </button>
            {addError && <p className="text-xs text-error mt-1">{addError}</p>}
          </div>

          {/* 受講生一覧 */}
          <input
            value={stuQuery}
            onChange={e => setStuQuery(e.target.value)}
            placeholder="名前・ふりがなで検索…"
            className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm mb-3 focus:outline-none focus:border-primary/40"
          />

          {stuLoading ? (
            <p className="text-sm text-text-muted text-center py-6">読み込み中…</p>
          ) : (
            <ul className="space-y-2">
              {filteredStudents.length === 0 && (
                <li className="text-sm text-text-muted py-6 text-center">該当なし</li>
              )}
              {filteredStudents.map(({ name, yomi, displayName }) => (
                <li key={name} className="bg-bg-card border border-border rounded-[var(--radius-card)] px-4 py-3 shadow-[var(--shadow-card)]">
                  {editing === name ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex flex-col gap-1">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(name); if (e.key === 'Escape') cancelEdit(); }}
                            placeholder="名前"
                            className="w-full px-3 py-1.5 bg-bg-page border border-primary/40 rounded-[var(--radius-button)] text-sm focus:outline-none"
                          />
                          <input
                            value={editYomi}
                            onChange={e => setEditYomi(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(name); if (e.key === 'Escape') cancelEdit(); }}
                            placeholder="ふりがな"
                            className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs focus:outline-none"
                          />
                          <input
                            value={editDisplayName}
                            onChange={e => setEditDisplayName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(name); if (e.key === 'Escape') cancelEdit(); }}
                            placeholder="専用ページ名"
                            className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => saveEdit(name)}
                            disabled={renaming}
                            className="px-3 py-1.5 bg-primary text-white rounded-[var(--radius-button)] text-xs font-semibold disabled:opacity-40"
                          >
                            {renaming ? '保存中…' : '保存'}
                          </button>
                          <button onClick={cancelEdit} className="px-3 py-1.5 text-text-muted text-xs text-center">
                            キャンセル
                          </button>
                        </div>
                      </div>
                      {renameError && <p className="text-[11px] text-error">{renameError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <Link href={`/teacher/students/${encodeURIComponent(name)}`} className="text-sm font-medium text-text-dark hover:text-primary block truncate">
                          {name}
                        </Link>
                        {yomi && <p className="text-[10px] text-text-muted">{yomi}</p>}
                      </div>
                      <button
                        onClick={() => startEdit({ name, yomi, displayName })}
                        className="shrink-0 px-2 py-1.5 text-text-muted hover:text-text-dark rounded-[var(--radius-button)] text-xs"
                        title="名前編集"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(name)}
                        disabled={deletingName === name}
                        className="shrink-0 px-3 py-1.5 text-error/60 hover:text-error hover:bg-error/5 rounded-[var(--radius-button)] text-xs disabled:opacity-40"
                        title="削除"
                      >
                        {deletingName === name ? '削除中…' : '削除'}
                      </button>
                      <a
                        href={`/practice-v2.html?student=${encodeURIComponent(name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 px-3 py-1.5 bg-primary/10 text-primary rounded-[var(--radius-button)] text-xs font-medium hover:bg-primary/20"
                      >
                        専用ページ →
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ========== 削除依頼 ========== */}
        <section>
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
        </section>

      </main>
    </div>
  );
}
