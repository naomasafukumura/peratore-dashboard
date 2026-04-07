'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { StudentEntry } from './page';

export default function StudentsClient({
  students: initialStudents,
  pendingDeletions: initialPending,
}: {
  students: StudentEntry[];
  pendingDeletions: string[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set(initialPending));

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editYomi, setEditYomi] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [newName, setNewName] = useState('');
  const [newYomi, setNewYomi] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const filtered = query.trim()
    ? students.filter(s => s.name.includes(query.trim()) || s.yomi.includes(query.trim()))
    : students;

  const startEdit = (s: StudentEntry) => {
    setEditing(s.name);
    setEditName(s.name ?? '');
    setEditYomi(s.yomi ?? '');
    setEditDisplayName(s.displayName ?? '');
    setRenameError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setRenameError(null);
  };

  const openNoteModal = (name: string) => {
    setNoteTarget(name);
    setNote('');
  };

  const handleAddStudent = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (students.some(s => s.name === trimmed)) {
      setAddError('すでに登録済みです');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, yomi: newYomi.trim(), displayName: newDisplayName.trim() }),
      });
      if (!res.ok) {
        const j = await res.json();
        setAddError(j.error || '追加に失敗しました');
        return;
      }
      const yomi = newYomi.trim();
      setStudents(prev => [...prev, { name: trimmed, yomi, displayName: newDisplayName.trim() }].sort((a, b) => {
        const ya = a.yomi || a.name;
        const yb = b.yomi || b.name;
        return ya.localeCompare(yb, 'ja');
      }));
      setNewName('');
      setNewYomi('');
      setNewDisplayName('');
    } catch {
      setAddError('追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const submitDeletionRequest = async () => {
    if (!noteTarget) return;
    setRequesting(noteTarget);
    try {
      const res = await fetch('/api/students/deletion-request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName: noteTarget, note }),
      });
      if (res.ok) {
        setPendingDeletions(prev => new Set([...prev, noteTarget]));
        setNoteTarget(null);
      } else {
        const d = await res.json();
        alert(`依頼失敗: ${d.error}`);
      }
    } finally {
      setRequesting(null);
    }
  };

  const saveEdit = async (oldName: string) => {
    const newName = editName.trim();
    const newYomi = editYomi.trim();
    if (!newName) { cancelEdit(); return; }
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch('/api/students/rename', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName, yomi: newYomi, displayName: editDisplayName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setRenameError(d.error || '更新失敗');
        return;
      }
      setStudents(prev => {
        const updated = prev.map(s =>
          s.name === oldName ? { name: newName, yomi: newYomi, displayName: editDisplayName.trim() } : s
        );
        return [...updated].sort((a, b) => {
          const ya = a.yomi || a.name;
          const yb = b.yomi || b.name;
          return ya.localeCompare(yb, 'ja');
        });
      });
      cancelEdit();
    } catch (e) {
      setRenameError((e as Error).message);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page">
      {/* 削除依頼モーダル */}
      {noteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-bg-card border border-border rounded-[var(--radius-card)] shadow-lg p-5 w-full max-w-sm">
            <h2 className="text-sm font-bold text-text-dark mb-1">削除依頼</h2>
            <p className="text-xs text-text-muted mb-3">「{noteTarget}」の削除を管理者に依頼します。</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="理由・メモ（任意）"
              rows={3}
              className="w-full px-3 py-2 bg-bg-page border border-border rounded-xl text-xs text-text-dark resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setNoteTarget(null)}
                className="flex-1 py-2 border border-border rounded-xl text-xs text-text-muted"
              >
                キャンセル
              </button>
              <button
                onClick={submitDeletionRequest}
                disabled={requesting === noteTarget}
                className="flex-1 py-2 bg-error text-white rounded-xl text-xs font-semibold disabled:opacity-40"
              >
                {requesting === noteTarget ? '送信中…' : '依頼を送る'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-text-dark">受講生リンク一覧</h1>
            <span className="text-xs text-text-muted">({students.length}人)</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <a href="/teacher" className="text-primary font-medium">ダッシュボード</a>
            <a href="/teacher-manual.html" target="_blank" rel="noopener noreferrer" className="text-primary font-medium">マニュアル</a>
            <a href="/teacher/logout" className="text-text-muted hover:text-text-dark">ログアウト</a>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3">
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
              <p className="text-[10px] text-text-muted mb-1">専用ページのお名前</p>
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
        <div className="max-w-2xl mx-auto px-4 pb-3 border-t border-border pt-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="名前・ふりがなで検索…"
            className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        <ul className="space-y-2">
          {filtered.length === 0 && (
            <li className="text-sm text-text-muted py-8 text-center">該当する受講生が見つかりません</li>
          )}
          {filtered.map(({ name, yomi, displayName }) => (
            <li
              key={name}
              className="bg-bg-card border border-border rounded-[var(--radius-card)] px-4 py-3 shadow-[var(--shadow-card)]"
            >
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
                        className="w-full px-3 py-1.5 bg-bg-page border border-primary/40 rounded-[var(--radius-button)] text-sm text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <input
                        value={editYomi}
                        onChange={e => setEditYomi(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(name); if (e.key === 'Escape') cancelEdit(); }}
                        placeholder="ふりがな（例: さとうゆい）"
                        className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark focus:outline-none"
                      />
                      <input
                        value={editDisplayName}
                        onChange={e => setEditDisplayName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(name); if (e.key === 'Escape') cancelEdit(); }}
                        placeholder="専用ページのお名前（例: 妙さん）"
                        className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark focus:outline-none"
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
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-text-muted hover:text-text-dark rounded-[var(--radius-button)] text-xs text-center"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                  {renameError && <p className="text-[11px] text-error">{renameError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/teacher/students/${encodeURIComponent(name)}`}
                      className="text-sm font-medium text-text-dark hover:text-primary block truncate"
                    >
                      {name}
                    </Link>
                    {yomi && <p className="text-[10px] text-text-muted">{yomi}</p>}
                  </div>
                  <button
                    onClick={() => startEdit({ name, yomi, displayName })}
                    className="shrink-0 px-2 py-1.5 text-text-muted hover:text-text-dark rounded-[var(--radius-button)] text-xs transition-colors"
                    title="名前・ふりがなを編集"
                  >
                    ✎
                  </button>
                  {pendingDeletions.has(name) ? (
                    <span className="shrink-0 px-3 py-1.5 text-text-muted text-xs border border-border rounded-[var(--radius-button)]">
                      依頼中…
                    </span>
                  ) : (
                    <button
                      onClick={() => openNoteModal(name)}
                      className="shrink-0 px-3 py-1.5 text-error/60 hover:text-error hover:bg-error/5 rounded-[var(--radius-button)] text-xs transition-colors"
                      title="削除依頼を送る"
                    >
                      削除依頼
                    </button>
                  )}
                  <a
                    href={`/practice-v2.html?student=${encodeURIComponent(name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-3 py-1.5 bg-primary/10 text-primary rounded-[var(--radius-button)] text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    専用ページ →
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
