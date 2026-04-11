'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { StudentEntry } from './page';

export default function StudentsClient({
  students: initialStudents,
}: {
  students: StudentEntry[];
  pendingDeletions: string[];
}) {
  const [students] = useState(initialStudents);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? students.filter(s => s.name.includes(query.trim()) || s.yomi.includes(query.trim()))
    : students;

  return (
    <div className="min-h-screen bg-bg-page">
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
          {filtered.map(({ name, yomi }) => (
            <li
              key={name}
              className="bg-bg-card border border-border rounded-[var(--radius-card)] px-4 py-3 shadow-[var(--shadow-card)]"
            >
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
                <a
                  href={`/practice-v2.html?student=${encodeURIComponent(name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-3 py-1.5 bg-primary/10 text-primary rounded-[var(--radius-button)] text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  専用ページ →
                </a>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
