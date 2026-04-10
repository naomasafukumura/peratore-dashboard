'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const PLACEHOLDER_LESSON_MEMO =
  'レッスンで話したこと・使った表現・日本語メモなど、自由に書いてください。\n例：週末の予定を聞かれた。What are you doing this weekend? に対して stay home と言いたかった。フォローで Netflix と聞かれた。';

const memoTextareaClass =
  'w-full px-3 py-3 bg-bg-page border border-border rounded-xl text-sm text-text-dark placeholder:text-text-light/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-shadow min-h-[12rem]';

type SimilarPattern = { trigger: string; similarityPct: number };

type ExtractedPattern = {
  situation_ja: string;
  fpp_question: string;
  spp: string;
  followup_question: string;
  followup_answer: string;
  character: string;
  suggested_category: string;
  similarPatterns?: SimilarPattern[];
};

function matchScore(query: string, target: string): number {
  if (!query || !target) return 0;
  if (target.includes(query)) return 1;
  let matched = 0;
  for (const ch of query) {
    if (target.includes(ch)) matched++;
  }
  return matched / query.length;
}

function isHiragana(s: string): boolean {
  return /^[\u3040-\u309F]+$/.test(s);
}

function studentMatches(query: string, s: { name: string; yomi: string; displayName: string }): boolean {
  if (!query) return true;
  const q = query.trim();
  return s.name.includes(q) || s.yomi.includes(q) || s.displayName.includes(q);
}

export default function LessonFormClient() {
  const pathname = usePathname() || '/';
  const [students, setStudents] = useState<{ name: string; yomi: string; displayName: string }[]>([]);
  const [studentName, setStudentName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const studentInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [lessonMemo, setLessonMemo] = useState('');

  const resolvedStudentName = studentName.trim();

  // stage: 'form' → 'preview' → 'saved'
  const [stage, setStage] = useState<'form' | 'preview' | 'saved'>('form');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [directSaving, setDirectSaving] = useState(false);
  const [directMode, setDirectMode] = useState(false);
  const [previewPatterns, setPreviewPatterns] = useState<ExtractedPattern[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [successStudentName, setSuccessStudentName] = useState<string | null>(null);
  const [similarPatterns, setSimilarPatterns] = useState<{ trigger: string; similarityPct: number }[]>([]);
  const [teacherGateEnabled, setTeacherGateEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await fetch('/api/teacher-auth/status', { cache: 'no-store', credentials: 'include' });
        const j = await st.json();
        if (!cancelled && typeof j.gateEnabled === 'boolean') setTeacherGateEnabled(j.gateEnabled);
      } catch {
        if (!cancelled) setTeacherGateEnabled(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/students?withYomi=1', { credentials: 'include' });
      const data = await res.json();
      if (!cancelled && Array.isArray(data.students)) setStudents(data.students);
    })();
    return () => { cancelled = true; };
  }, []);

  const clearForm = () => {
    setLessonMemo('');
    setMessage(null);
    setSimilarPatterns([]);
    setPreviewPatterns([]);
    setStage('form');
    setSuccessStudentName(null);
    setDirectMode(false);
  };

  /** ステップ1: AI解析してプレビュー表示 */
  const analyze = async () => {
    setMessage(null);
    if (!resolvedStudentName) { setMessage('受講生名を入力してください'); return; }
    if (lessonMemo.trim().length < 20) { setMessage('レッスンメモは20文字以上で入力してください'); return; }

    setDirectMode(false);
    setAnalyzing(true);
    try {
      const res = await fetch('/api/lesson-submission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'analyze-memo', studentName: resolvedStudentName, rawLessonMemo: lessonMemo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '解析に失敗しました');
        return;
      }
      if (!Array.isArray(data.patterns) || data.patterns.length === 0) {
        setMessage('解析結果がありません');
        return;
      }
      setPreviewPatterns(data.patterns);
      setSelectedIndexes(new Set(data.patterns.map((_: ExtractedPattern, i: number) => i)));
      setStage('preview');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  /** そのまま登録: 例文テキストをAIで会話チャンクに分割→プレビュー表示（まとめ表示） */
  const registerDirect = async () => {
    setMessage(null);
    if (!resolvedStudentName) { setMessage('受講生名を入力してください'); return; }
    if (lessonMemo.trim().length < 20) { setMessage('レッスンメモは20文字以上で入力してください'); return; }

    setDirectMode(true);
    setDirectSaving(true);
    try {
      const res = await fetch('/api/lesson-submission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'analyze-direct', studentName: resolvedStudentName, rawLessonMemo: lessonMemo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '解析に失敗しました');
        return;
      }
      if (!Array.isArray(data.patterns) || data.patterns.length === 0) {
        setMessage('解析結果がありません');
        return;
      }
      setPreviewPatterns(data.patterns);
      setSelectedIndexes(new Set(data.patterns.map((_: ExtractedPattern, i: number) => i)));
      setStage('preview');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setDirectSaving(false);
    }
  };

  /** ステップ2: 確認後に保存 */
  const save = async () => {
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch('/api/lesson-submission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'submit-preview',
          studentName: resolvedStudentName,
          rawLessonMemo: lessonMemo.trim(),
          patterns: directMode
            ? previewPatterns
            : previewPatterns.filter((_, i) => selectedIndexes.has(i)),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '登録処理に失敗しました');
        return;
      }
      setMessage(data.message || '登録フローを受け付けました');
      setSuccessStudentName(resolvedStudentName);
      if (Array.isArray(data.saved?.similarPatterns)) setSimilarPatterns(data.saved.similarPatterns);
      setStage('saved');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page">
      {teacherGateEnabled === false && (
        <div className="bg-amber-bg border-b border-amber-bd text-amber text-[11px] px-4 py-2 text-center">
          <strong className="font-semibold">先生用パスワード保護はオフです。</strong>
          `.env.local` に <code className="text-[10px]">TEACHER_PASSWORD=…</code> を入れて{' '}
          <code className="text-[10px]">npm run dev</code> を再起動すると、先に{' '}
          <a href="/teacher/login" className="underline font-medium">ログインページ</a>
          へ案内されます。
        </div>
      )}
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {stage === 'preview' ? (
              <button onClick={() => setStage('form')} className="text-text-muted hover:text-text-dark shrink-0 text-sm">←</button>
            ) : (
              <a href="/teacher" className="text-text-muted hover:text-text-dark shrink-0 text-sm">←</a>
            )}
            <h1 className="text-base font-bold text-text-dark truncate">
              {stage === 'preview' ? `解析結果（${previewPatterns.length}チャンク）` : 'レッスン後フォーム'}
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a href="/teacher" className="text-xs text-primary font-medium">ダッシュボード</a>
            <a href="/teacher-manual.html" target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium">マニュアル</a>
            <a href="/teacher/logout" className="text-xs text-text-muted hover:text-text-dark">ログアウト</a>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 pb-24">

        {/* ── フォーム画面 ── */}
        {stage === 'form' && (
          <>
            <section className="bg-bg-card rounded-[var(--radius-card)] border border-border p-4 mb-4 shadow-[var(--shadow-card)]">
              <h2 className="text-xs font-semibold text-text-dark mb-2">受講生</h2>
              <div className="relative">
                <div className="flex">
                  <input
                    ref={studentInputRef}
                    value={studentName}
                    onChange={(e) => { setStudentName(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={(e) => { if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) setShowSuggestions(false); }}
                    placeholder="名前を入力 or リストから選んでください"
                    className="flex-1 px-3 py-2 bg-bg-page border border-border rounded-l-[var(--radius-button)] text-sm focus:outline-none focus:border-primary/40"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setShowSuggestions(v => !v); studentInputRef.current?.focus(); }}
                    className="px-2 bg-bg-page border border-l-0 border-border rounded-r-[var(--radius-button)] text-text-muted hover:text-text-dark"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                </div>
                {showSuggestions && (() => {
                  const q = studentName.trim();
                  const hits = q
                    ? students.filter(s => studentMatches(q, s))
                    : students;
                  if (!hits.length) return null;
                  return (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto"
                    >
                      {hits.map(s => (
                        <button
                          key={s.name}
                          type="button"
                          onMouseDown={() => { setStudentName(s.name); setShowSuggestions(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-text-dark hover:bg-primary/10"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {studentName.trim() && (
                <p className="text-[11px] text-text-muted mt-1">
                  選択中: <span className="font-medium text-text-dark">{studentName.trim()}</span>
                </p>
              )}
            </section>

            <section className="bg-bg-card rounded-[var(--radius-card)] border border-border p-4 shadow-[var(--shadow-card)]">
              <label className="block text-xs font-semibold text-text-dark mb-2">レッスンメモ（自由記述）</label>
              <textarea
                value={lessonMemo}
                onChange={(e) => setLessonMemo(e.target.value)}
                rows={10}
                className={memoTextareaClass}
                placeholder={PLACEHOLDER_LESSON_MEMO}
              />
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={analyze}
                  disabled={analyzing || directSaving || !resolvedStudentName || lessonMemo.trim().length < 20}
                  className="px-4 py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold disabled:opacity-40"
                >
                  {analyzing ? 'AI解析中…' : '解析して確認'}
                </button>
                <button
                  type="button"
                  onClick={registerDirect}
                  disabled={directSaving || analyzing || !resolvedStudentName || lessonMemo.trim().length < 20}
                  className="px-4 py-2.5 bg-[#E9852D] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#D4751F]"
                >
                  {directSaving ? 'AI分割・登録中…' : 'そのまま登録'}
                </button>
              </div>
            </section>

            {message && (
              <p className="mt-3 text-xs text-error px-0.5">{message}</p>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={clearForm} className="px-5 py-2.5 border border-border rounded-[var(--radius-button)] text-sm text-text-muted">
                メモをクリア
              </button>
            </div>
          </>
        )}

        {/* ── プレビュー画面 ── */}
        {stage === 'preview' && (
          <>
            <p className="text-[11px] text-text-muted mb-3">
              受講生: <span className="font-medium text-text-dark">{resolvedStudentName}</span>
              　内容を確認して「保存 + 音声生成」を押してください。
            </p>

            {/* そのまま登録モード: 全チャンクを1枚にまとめて表示 */}
            {directMode ? (
              <div className="bg-bg-card border border-primary/50 rounded-[var(--radius-card)] shadow-[var(--shadow-card)] mb-4 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">全{previewPatterns.length}チャンク</span>
                </div>
                <div className="divide-y divide-border">
                  {previewPatterns.map((p, i) => (
                    <div key={i} className="flex gap-3 px-4 py-3">
                      {/* 左: 会話 */}
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex gap-2">
                          <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7">FPP</span>
                          <span className="text-sm text-text-dark">{p.fpp_question}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7">SPP</span>
                          <span className="text-sm text-text-dark">{p.spp}</span>
                        </div>
                        {p.followup_question && (
                          <div className="flex gap-2">
                            <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7">FQ</span>
                            <span className="text-sm text-text-dark">{p.followup_question}</span>
                          </div>
                        )}
                        {p.followup_answer && (
                          <div className="flex gap-2">
                            <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7">FA</span>
                            <span className="text-sm text-text-dark">{p.followup_answer}</span>
                          </div>
                        )}
                      </div>
                      {/* 右: メタ情報 */}
                      <div className="w-28 shrink-0 text-right">
                        <p className="text-[10px] font-semibold text-text-muted leading-snug">{p.suggested_category}</p>
                        {p.situation_ja && (
                          <p className="text-[10px] text-text-light mt-0.5 leading-snug">{p.situation_ja}</p>
                        )}
                        {p.similarPatterns && p.similarPatterns.length > 0 && (
                          <p className="text-[10px] text-amber mt-1">⚠️ 類似あり</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* 解析して確認モード: 個別チャンクカード */
              <div className="space-y-3 mb-4">
                {previewPatterns.map((p, i) => {
                  const checked = selectedIndexes.has(i);
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedIndexes(prev => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      })}
                      className={`bg-bg-card border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] cursor-pointer transition-colors ${checked ? 'border-primary/50' : 'border-border opacity-50'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="w-4 h-4 accent-primary"
                            onClick={e => e.stopPropagation()}
                          />
                          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">チャンク {i + 1}</span>
                        </label>
                        <span className="text-[10px] text-text-muted">{p.suggested_category}</span>
                      </div>
                      {p.similarPatterns && p.similarPatterns.length > 0 && (
                        <div className="mb-2 p-2 bg-amber-bg border border-amber-bd rounded-lg">
                          <p className="text-[10px] font-semibold text-amber mb-1">⚠️ 似たチャンクがすでにあります</p>
                          {p.similarPatterns.map((s) => (
                            <p key={s.trigger} className="text-[10px] text-text-muted">
                              「{s.trigger}」<span className="text-amber font-medium ml-1">({s.similarityPct}%)</span>
                            </p>
                          ))}
                        </div>
                      )}
                      {p.situation_ja && (
                        <p className="text-[11px] text-text-muted mb-2 italic">{p.situation_ja}</p>
                      )}
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-[10px] font-semibold text-text-muted">FPP　</span>
                          <span className="text-sm text-text-dark">{p.fpp_question}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-text-muted">SPP　</span>
                          <span className="text-sm text-text-dark">{p.spp}</span>
                        </div>
                        {p.followup_question && (
                          <div>
                            <span className="text-[10px] font-semibold text-text-muted">FQ　　</span>
                            <span className="text-sm text-text-dark">{p.followup_question}</span>
                          </div>
                        )}
                        {p.followup_answer && (
                          <div>
                            <span className="text-[10px] font-semibold text-text-muted">FA　　</span>
                            <span className="text-sm text-text-dark">{p.followup_answer}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStage('form')}
                className="px-5 py-2.5 border border-border rounded-[var(--radius-button)] text-sm text-text-muted"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || (!directMode && selectedIndexes.size === 0)}
                className="flex-1 py-2.5 bg-orange-400 text-black rounded-[var(--radius-button)] text-sm font-semibold disabled:opacity-40"
              >
                {saving
                  ? '保存・音声生成中…'
                  : directMode
                    ? '保存 + 音声生成'
                    : `${selectedIndexes.size}チャンクを保存 + 音声生成`
                }
              </button>
            </div>

            {message && (
              <p className="mt-3 text-xs text-error px-0.5">{message}</p>
            )}
          </>
        )}

        {/* ── 保存完了画面 ── */}
        {stage === 'saved' && (
          <div className="space-y-3">
            <p className="text-sm text-success font-medium">{message}</p>

            {similarPatterns.length > 0 && (
              <div className="p-3 bg-amber-bg border border-amber-bd rounded-xl">
                <p className="text-[11px] font-semibold text-amber mb-1">似たチャンクがすでにあります</p>
                <ul className="space-y-1">
                  {similarPatterns.map((p) => (
                    <li key={p.trigger} className="text-[11px] text-text-muted">
                      「{p.trigger}」<span className="text-amber font-medium">({p.similarityPct}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {successStudentName && (
              <a
                href={`/practice-v2.html?student=${encodeURIComponent(successStudentName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold text-center"
              >
                {successStudentName} の教材を確認 →
              </a>
            )}

            <button
              type="button"
              onClick={clearForm}
              className="w-full py-2.5 border border-border rounded-[var(--radius-button)] text-sm text-text-muted"
            >
              新しいメモを登録
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
