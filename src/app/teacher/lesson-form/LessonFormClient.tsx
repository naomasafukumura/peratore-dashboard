'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const PLACEHOLDER_LESSON_MEMO =
  'レッスンで話したこと・使った表現・日本語メモなど、自由に書いてください。\n例：週末の予定を聞かれた。What are you doing this weekend? に対して stay home と言いたかった。フォローで Netflix と聞かれた。';

const memoTextareaClass =
  'w-full px-3 py-3 bg-bg-page border border-border rounded-xl text-sm text-text-dark placeholder:text-text-light/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-shadow min-h-[12rem]';

export default function LessonFormClient() {
  const [students, setStudents] = useState<string[]>([]);
  const [surnameFilter, setSurnameFilter] = useState('');
  const [studentName, setStudentName] = useState('');
  /** リストにいない受講生（空ならプルダウンの値を使う） */
  const [manualStudentName, setManualStudentName] = useState('');
  const [lessonMemo, setLessonMemo] = useState('');

  const resolvedStudentName = manualStudentName.trim() || studentName;

  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successStudentName, setSuccessStudentName] = useState<string | null>(null);
  const [teacherGateEnabled, setTeacherGateEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await fetch('/api/teacher-auth/status');
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
      const res = await fetch('/api/students');
      const data = await res.json();
      if (!cancelled && Array.isArray(data.students)) {
        setStudents(data.students);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStudents = useMemo(() => {
    const t = surnameFilter.trim();
    if (!t) return students;
    return students.filter((s) => s.includes(t) || s.startsWith(t));
  }, [students, surnameFilter]);

  const clearForm = () => {
    setLessonMemo('');
    setMessage(null);
  };

  /** 登録開始：AI 解析（2往復＋カテゴリ）→ submit-preview（DB 接続時は保存・音声） */
  const startRegistration = async () => {
    setMessage(null);
    if (!resolvedStudentName) {
      setMessage('受講生をプルダウンで選ぶか、下の欄に名前を入力してください');
      return;
    }
    if (lessonMemo.trim().length < 20) {
      setMessage('レッスンメモは20文字以上で入力してください');
      return;
    }

    setRegistering(true);
    try {
      const resAnalyze = await fetch('/api/lesson-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'analyze-memo',
          studentName: resolvedStudentName,
          rawLessonMemo: lessonMemo.trim(),
        }),
      });
      const dataAnalyze = await resAnalyze.json();
      if (!resAnalyze.ok) {
        setMessage(dataAnalyze.error || '解析に失敗しました');
        return;
      }
      const ex = dataAnalyze.extracted;
      if (!ex) {
        setMessage('解析結果がありません');
        return;
      }

      const resSubmit = await fetch('/api/lesson-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'submit-preview',
          studentName: resolvedStudentName,
          rawLessonMemo: lessonMemo.trim(),
          situation: (ex.situation_ja ?? '').trim(),
          suggestedCategory: (ex.suggested_category ?? '').trim(),
          character: (ex.character ?? '友人').trim() || '友人',
          trigger: (ex.fpp_question ?? '').trim(),
          spp: (ex.spp ?? '').trim(),
          followupQuestion: (ex.followup_question ?? '').trim(),
          followupAnswer: (ex.followup_answer ?? '').trim(),
          sourceMode: 'free',
          sourcePatternId: null,
        }),
      });
      const dataSubmit = await resSubmit.json();
      if (!resSubmit.ok) {
        setMessage(dataSubmit.error || '登録処理に失敗しました');
        return;
      }
      setMessage(dataSubmit.message || '登録フローを受け付けました');
      setSuccessStudentName(resolvedStudentName);
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
            プルダウンは「すでに割り当て or 受講生マイページで登録した名前」です。
            <strong className="font-medium text-text-dark">初めての受講生</strong>
            は、下の「名前を直接入力」に書いてください（
            <code className="text-[10px]">practice-v2?student=</code> と同じ表記にすると教材が一致します）。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={surnameFilter}
              onChange={(e) => setSurnameFilter(e.target.value)}
              placeholder="苗字などで絞り込み"
              className="px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm"
            />
            <select
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm"
            >
              <option value="">プルダウンから選択</option>
              {filteredStudents.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <label className="block mt-3 text-[11px] font-medium text-text-dark">名前を直接入力（リストにない場合）</label>
          <input
            value={manualStudentName}
            onChange={(e) => setManualStudentName(e.target.value)}
            placeholder="例: 山田太郎（受講生マイページの登録名と同じ表記）"
            className="mt-1 w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm"
          />
          {students.length === 0 && (
            <p className="text-[11px] text-amber mt-2">
              プルダウンは 0 件です。上の「直接入力」に受講生名を書けば登録できます（DB 未接続のときは別途エラーになります）。
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
              className={`text-xs px-0.5 ${message.includes('失敗') || message.includes('必須') || message.includes('OPENAI') || message.includes('解析') ? 'text-error' : 'text-text-muted'}`}
            >
              {message}
            </p>
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
