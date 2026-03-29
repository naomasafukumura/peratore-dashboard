'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const PLACEHOLDER_LESSON_MEMO =
  'レッスンで話したこと・使った表現・日本語メモなど、自由に書いてください。\n例：週末の予定を聞かれた。What are you doing this weekend? に対して stay home と言いたかった。フォローで Netflix と聞かれた。';

const memoTextareaClass =
  'w-full px-3 py-3 bg-bg-page border border-border rounded-xl text-sm text-text-dark placeholder:text-text-light/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-shadow min-h-[12rem]';

export default function LessonFormClient() {
  const pathname = usePathname() || '/';
  const [students, setStudents] = useState<string[]>([]);
  const [studentName, setStudentName] = useState('');
  const [lessonMemo, setLessonMemo] = useState('');

  const resolvedStudentName = studentName.trim();

  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successStudentName, setSuccessStudentName] = useState<string | null>(null);
  const [similarPatterns, setSimilarPatterns] = useState<{ trigger: string; similarityPct: number }[]>([]);
  const [teacherGateEnabled, setTeacherGateEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await fetch('/api/teacher-auth/status', {
          cache: 'no-store',
          credentials: 'include',
        });
        const j = await st.json();
        if (!cancelled && typeof j.gateEnabled === 'boolean') {
          setTeacherGateEnabled(j.gateEnabled);
        }
      } catch {
        if (!cancelled) setTeacherGateEnabled(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/students', { credentials: 'include' });
      const data = await res.json();
      if (!cancelled && Array.isArray(data.students)) {
        setStudents(data.students);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearForm = () => {
    setLessonMemo('');
    setMessage(null);
    setSimilarPatterns([]);
  };

  /** 登録開始：AI 解析（2往復＋カテゴリ）→ submit-preview（DB 接続時は保存・音声） */
  const startRegistration = async () => {
    setMessage(null);
    if (!resolvedStudentName) {
      setMessage('受講生名を入力してください');
      return;
    }
    if (lessonMemo.trim().length < 20) {
      setMessage('レッスンメモは20文字以上で入力してください');
      return;
    }

    setSimilarPatterns([]);
    setRegistering(true);
    try {
      const resAnalyze = await fetch('/api/lesson-submission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'analyze-memo',
          studentName: resolvedStudentName,
          rawLessonMemo: lessonMemo.trim(),
        }),
      });
      const dataAnalyze = await resAnalyze.json();
      if (!resAnalyze.ok) {
        const hint =
          typeof dataAnalyze.hint === 'string' ? dataAnalyze.hint.trim() : '';
        const err = dataAnalyze.error || '解析に失敗しました';
        setMessage(hint ? `${err}\n${hint}` : err);
        return;
      }
      const patterns = dataAnalyze.patterns;
      if (!Array.isArray(patterns) || patterns.length === 0) {
        setMessage('解析結果がありません');
        return;
      }

      const resSubmit = await fetch('/api/lesson-submission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'submit-preview',
          studentName: resolvedStudentName,
          rawLessonMemo: lessonMemo.trim(),
          patterns,
        }),
      });
      const dataSubmit = await resSubmit.json();
      if (!resSubmit.ok) {
        const hint =
          typeof dataSubmit.hint === 'string' ? dataSubmit.hint.trim() : '';
        const err = dataSubmit.error || '登録処理に失敗しました';
        setMessage(hint ? `${err}\n${hint}` : err);
        return;
      }
      setMessage(dataSubmit.message || '登録フローを受け付けました');
      setSuccessStudentName(resolvedStudentName);
      if (Array.isArray(dataSubmit.saved?.similarPatterns)) {
        setSimilarPatterns(dataSubmit.saved.similarPatterns);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page">
      {teacherGateEnabled === false && (
        <div className="bg-amber-bg border-b border-amber-bd text-amber text-[11px] px-4 py-2 text-center">
          <strong className="font-semibold">先生用パスワード保護はオフです。</strong>
          `.env.local` に <code className="text-[10px]">TEACHER_PASSWORD=…</code> を入れて{' '}
          <code className="text-[10px]">npm run dev</code> を再起動すると、先に{' '}
          <a href="/teacher/login" className="underline font-medium">
            ログインページ
          </a>
          へ案内されます。
        </div>
      )}
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/teacher" className="text-text-muted hover:text-text-dark shrink-0 text-sm">
              ←
            </Link>
            <h1 className="text-base font-bold text-text-dark truncate">レッスン後フォーム</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/practice-v2.html" className="text-xs text-primary font-medium">
              教材
            </Link>
            <Link href="/teacher/dashboard" className="text-xs text-primary font-medium">
              ダッシュボード
            </Link>
            <Link
              href="/teacher/logout"
              className="text-xs text-text-muted hover:text-text-dark"
              title="先生用セッション Cookie を消します（パスワード保護オフ時は効果のみ）"
            >
              ログアウト
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 pb-24">
        <section className="bg-bg-card rounded-[var(--radius-card)] border border-border p-4 mb-4 shadow-[var(--shadow-card)]">
          <h2 className="text-xs font-semibold text-text-dark mb-2">受講生</h2>
          <p className="text-[11px] text-text-muted mb-2">
            苗字を入力すると候補が出ます。リストにない場合はそのまま入力してください。
          </p>
          <input
            list="student-list"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="例: 佐藤（候補から選ぶか直接入力）"
            className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm"
          />
          <datalist id="student-list">
            {students.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {studentName.trim() && (
            <p className="text-[11px] text-text-muted mt-1">
              選択中: <span className="font-medium text-text-dark">{studentName.trim()}</span>
            </p>
          )}
        </section>

        <section className="overflow-visible bg-bg-card rounded-[var(--radius-card)] border border-border p-4 shadow-[var(--shadow-card)]">
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
              onClick={startRegistration}
              disabled={registering || !resolvedStudentName || lessonMemo.trim().length < 20}
              className="px-4 py-2.5 bg-primary text-text-dark rounded-xl text-sm font-semibold disabled:opacity-40"
            >
              {registering ? '処理中…' : '登録開始'}
            </button>
            <span className="text-[11px] text-text-muted">20文字以上・要 OPENAI_API_KEY</span>
          </div>
        </section>

        {message && (
          <div className="mt-3">
            <p
              className={`text-xs px-0.5 ${message.includes('失敗') || message.includes('必須') || message.includes('OPENAI') || message.includes('解析') || message.includes('ログインが必要') ? 'text-error' : 'text-text-muted'}`}
            >
              {message}
            </p>
            {message.includes('ログインが必要') && (
              <p className="text-xs mt-2 text-text-muted">
                <Link
                  href={`/teacher/login?next=${encodeURIComponent(pathname)}`}
                  className="font-medium text-primary underline"
                >
                  先生用ログインへ
                </Link>
              </p>
            )}
            {similarPatterns.length > 0 && (
              <div className="mt-3 p-3 bg-amber-bg border border-amber-bd rounded-xl">
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
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/practice-v2.html?student=${encodeURIComponent(successStudentName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-primary text-text-dark rounded-xl text-sm font-semibold"
                >
                  {successStudentName} の教材を確認 →
                </a>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={clearForm}
            className="px-5 py-2.5 border border-border rounded-[var(--radius-button)] text-sm text-text-muted"
          >
            メモをクリア
          </button>
        </div>
      </main>
    </div>
  );
}
