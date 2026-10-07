'use client';

import { useEffect, useMemo, useState } from 'react';

type Theme = { t: string; j: string; q: [string, string][] };
type Category = { cat: string; themes: Theme[] };

/**
 * レッスン後フォーム内「フリートーク回答」。
 * テーマを選び、質問ごとに受講生の回答（直した英文）を登録する。
 * 受講生は practice-v2.html の「フリートーク一覧」で自分の回答を見られる。
 */
export default function FreeTalkAnswerSection({ studentName }: { studentName: string }) {
  const [topics, setTopics] = useState<Category[]>([]);
  const [themeKey, setThemeKey] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [saved, setSaved] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/free-talk-topics.json').then(r => r.json()).then(setTopics).catch(() => setTopics([]));
  }, []);

  // 受講生が変わったら登録済みの回答を読み直す
  useEffect(() => {
    setSaved({});
    setMessage(null);
    if (!studentName) return;
    let cancelled = false;
    fetch(`/api/free-talk-answers?student=${encodeURIComponent(studentName)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled || !Array.isArray(data.answers)) return;
        const map: Record<string, string[]> = {};
        for (const a of data.answers) {
          (map[a.theme_key] ||= [])[a.q_index] = a.answer;
        }
        setSaved(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [studentName]);

  const theme = useMemo(() => {
    for (const c of topics) for (const t of c.themes) if (t.t === themeKey) return t;
    return null;
  }, [topics, themeKey]);

  useEffect(() => {
    if (!theme) { setAnswers([]); return; }
    setAnswers(theme.q.map((_, i) => saved[theme.t]?.[i] || ''));
    setMessage(null);
  }, [theme, saved]);

  const save = async () => {
    if (!studentName || !theme) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/free-talk-answers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName, themeKey: theme.t, answers }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || '保存に失敗しました'); return; }
      setSaved(prev => ({ ...prev, [theme.t]: answers.map(a => a.trim()) }));
      setMessage('保存しました。受講生ページの「フリートーク一覧」に表示されます');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  let n = 0;
  return (
    <section className="bg-bg-card rounded-[var(--radius-card)] border border-border p-4 mt-4 shadow-[var(--shadow-card)]">
      <h2 className="text-xs font-semibold text-text-dark mb-1">フリートーク回答</h2>
      <p className="text-[11px] text-text-muted mb-3">話したテーマを選び、受講生の回答（直した英文）を入れてください。</p>
      {!studentName ? (
        <p className="text-xs text-text-muted">先に受講生を選んでください</p>
      ) : (
        <>
          <select
            value={themeKey}
            onChange={(e) => setThemeKey(e.target.value)}
            className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark focus:outline-none focus:border-primary/40"
          >
            <option value="">テーマを選ぶ</option>
            {topics.map(c => (
              <optgroup key={c.cat} label={c.cat}>
                {c.themes.map(t => {
                  n++;
                  const done = (saved[t.t] || []).some(Boolean);
                  return (
                    <option key={t.t} value={t.t}>
                      {`${n}. ${t.t}（${t.j}）${done ? ' ✓登録済み' : ''}`}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>

          {theme && (
            <div className="mt-3 space-y-3">
              {theme.q.map((q, i) => (
                <div key={i}>
                  <p className="text-sm text-text-dark font-medium">{i + 1}. {q[0]}</p>
                  <p className="text-[11px] text-text-muted mb-1">{q[1]}</p>
                  <textarea
                    value={answers[i] || ''}
                    onChange={(e) => setAnswers(prev => prev.map((a, k) => (k === i ? e.target.value : a)))}
                    rows={2}
                    placeholder="受講生の回答（英語）"
                    className="w-full px-3 py-2 bg-bg-page border border-border rounded-xl text-sm text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold disabled:opacity-40"
              >
                {saving ? '保存中…' : 'フリートーク回答を保存'}
              </button>
            </div>
          )}
          {message && <p className="mt-2 text-xs text-text-dark">{message}</p>}
        </>
      )}
    </section>
  );
}
