'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Props {
  categoryNames: string[];
  studentNames: string[];
}

const inputClass =
  'w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40';

export default function TeacherClient({ categoryNames, studentNames }: Props) {
  const [category, setCategory] = useState('');
  const [situation, setSituation] = useState('');
  const [fpp, setFpp] = useState('');
  const [spp, setSpp] = useState('');
  const [followupQ, setFollowupQ] = useState('');
  const [followupA, setFollowupA] = useState('');
  const [studentName, setStudentName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean; student?: string } | null>(null);

  const canSave = category.trim() && fpp.trim() && spp.trim() && studentName.trim();

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const savedStudent = studentName.trim();
      const res = await fetch('/api/patterns/manual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName: category.trim(),
          situation: situation.trim(),
          fppQuestion: fpp.trim(),
          spp: spp.trim(),
          followupQuestion: followupQ.trim(),
          followupAnswer: followupA.trim(),
          studentName: savedStudent,
          character: '友人',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || '保存失敗', ok: false });
        return;
      }
      setMessage({ text: `保存・音声生成完了 ✓`, ok: true, student: savedStudent });
      setSituation('');
      setFpp('');
      setSpp('');
      setFollowupQ('');
      setFollowupA('');
      setStudentName('');
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="text-base font-bold text-text-dark">新規教材管理</h1>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/teacher/students" className="text-primary font-medium">受講生リンク一覧</Link>
            <Link href="/teacher/lesson-form" className="text-primary font-medium">レッスン後フォーム</Link>
            <Link href="/teacher/logout" className="text-text-muted hover:text-text-dark">ログアウト</Link>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 pb-24 space-y-3">

        {/* 受講生（必須・先頭に移動） */}
        <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
          <label className="block text-xs font-semibold text-text-dark mb-1">
            受講生 <span className="text-error">*</span>
          </label>
          <input
            list="student-list"
            value={studentName}
            onChange={e => setStudentName(e.target.value)}
            placeholder="名前を入力または選択"
            className={inputClass}
            autoFocus
          />
          <datalist id="student-list">
            {studentNames.map(n => <option key={n} value={n} />)}
          </datalist>
          {!studentName.trim() && (
            <p className="text-[11px] text-text-muted mt-1">受講生を選択しないと保存できません</p>
          )}
        </div>

        {/* カテゴリ */}
        <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
          <label className="block text-xs font-semibold text-text-dark mb-1">
            カテゴリ <span className="text-error">*</span>
          </label>
          <input
            list="category-list"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="リストから選ぶか直接入力"
            className={inputClass}
          />
          <datalist id="category-list">
            {categoryNames.map(n => <option key={n} value={n} />)}
          </datalist>
        </div>

        {/* メインフォーム */}
        <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-dark mb-1">Situation</label>
            <input
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="例: 同僚に週末の予定を聞かれた"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-dark mb-1">
              FPP（相手のセリフ）<span className="text-error">*</span>
            </label>
            <input
              value={fpp}
              onChange={e => setFpp(e.target.value)}
              placeholder="例: What are you gonna do this weekend?"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-dark mb-1">
              SPP（模範回答）<span className="text-error">*</span>
            </label>
            <input
              value={spp}
              onChange={e => setSpp(e.target.value)}
              placeholder="例: I'm gonna relax at home."
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-dark mb-1">Followup Question</label>
            <input
              value={followupQ}
              onChange={e => setFollowupQ(e.target.value)}
              placeholder="例: Oh, are you gonna watch Netflix?"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-dark mb-1">Followup Answer</label>
            <input
              value={followupA}
              onChange={e => setFollowupA(e.target.value)}
              placeholder="例: Yeah, something like that."
              className={inputClass}
            />
          </div>
        </div>

        {/* 送信 */}
        <button
          onClick={save}
          disabled={saving || !canSave}
          className="w-full py-3 bg-orange-400 text-black rounded-[var(--radius-button)] text-sm font-semibold disabled:opacity-40 transition-opacity hover:bg-orange-500"
        >
          {saving ? '保存・音声生成中…' : '保存 + 音声生成'}
        </button>

        {message && (
          <div className={`text-xs px-1 ${message.ok ? 'text-success' : 'text-error'}`}>
            <p>{message.text}</p>
            {message.ok && message.student && (
              <a
                href={`/practice-v2.html?student=${encodeURIComponent(message.student)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium mt-1 inline-block"
              >
                {message.student} のレッスンページを確認 →
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
