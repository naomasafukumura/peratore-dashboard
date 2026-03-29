'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Pattern {
  id: number;
  situation: string | null;
  fpp_question: string;
  spp: string;
  followup_question: string | null;
  followup_answer: string | null;
  character: string;
  category_name: string;
  raw_memo: string | null;
  has_trigger_audio: boolean;
  has_spp_audio: boolean;
  has_followup_audio: boolean;
  has_natural_audio: boolean;
}

type Edits = Partial<Pick<Pattern, 'situation' | 'fpp_question' | 'spp' | 'followup_question' | 'followup_answer'>>;

export default function StudentPatternsClient({
  studentName,
  initialPatterns,
}: {
  studentName: string;
  initialPatterns: Pattern[];
}) {
  const [patterns, setPatterns] = useState<Pattern[]>(initialPatterns);
  const [edits, setEdits] = useState<Record<number, Edits>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const [memoOpen, setMemoOpen] = useState<Record<number, boolean>>({});

  const updateEdit = (id: number, field: keyof Edits, value: string) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const isDirty = (id: number) => Object.keys(edits[id] ?? {}).length > 0;

  const val = (p: Pattern, field: keyof Edits): string => {
    const edit = edits[p.id];
    if (edit && field in edit) return String(edit[field] ?? '');
    return String(p[field] ?? '');
  };

  const savePattern = async (p: Pattern) => {
    const patch = edits[p.id] ?? {};
    const updated = { ...p, ...patch };
    setSaving(p.id);
    try {
      const putRes = await fetch(`/api/patterns/${p.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation: updated.situation ?? '',
          fppIntro: null,
          fppQuestion: updated.fpp_question,
          spp: updated.spp,
          character: updated.character,
          followupQuestion: updated.followup_question ?? '',
          followupAnswer: updated.followup_answer ?? '',
        }),
      });
      if (!putRes.ok) throw new Error('保存失敗');

      const audioTypes = ['fpp_question', 'spp'];
      if (updated.followup_question?.trim()) audioTypes.push('followup_question');
      if (updated.followup_answer?.trim()) audioTypes.push('natural');

      const audioRes = await fetch('/api/audio/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patternId: p.id, audioTypes }),
      });
      const audioData = await audioRes.json();

      setPatterns(prev =>
        prev.map(pat =>
          pat.id === p.id
            ? {
                ...pat,
                ...patch,
                has_trigger_audio: audioData.results?.fpp_question ?? pat.has_trigger_audio,
                has_spp_audio: audioData.results?.spp ?? pat.has_spp_audio,
                has_followup_audio: audioData.results?.followup_question ?? pat.has_followup_audio,
                has_natural_audio: audioData.results?.natural ?? pat.has_natural_audio,
              }
            : pat
        )
      );
      setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n; });
      setSaveMsg(prev => ({ ...prev, [p.id]: '保存・音声生成完了 ✓' }));
      setTimeout(() => setSaveMsg(prev => { const n = { ...prev }; delete n[p.id]; return n; }), 3000);
    } catch (e) {
      setSaveMsg(prev => ({ ...prev, [p.id]: '失敗: ' + (e as Error).message }));
    } finally {
      setSaving(null);
    }
  };

  const deletePattern = async (id: number) => {
    if (!confirm('このフレーズを削除しますか？')) return;
    setDeleting(id);
    try {
      await fetch(`/api/patterns/${id}`, { method: 'DELETE', credentials: 'include' });
      setPatterns(prev => prev.filter(p => p.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  // カテゴリごとにグループ化
  const grouped = new Map<string, Pattern[]>();
  for (const p of patterns) {
    if (!grouped.has(p.category_name)) grouped.set(p.category_name, []);
    grouped.get(p.category_name)!.push(p);
  }

  return (
    <div className="min-h-screen bg-bg-page">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/teacher/students" className="text-text-muted hover:text-text-dark text-sm shrink-0">←</Link>
            <h1 className="text-base font-bold text-text-dark truncate">{studentName}</h1>
            <span className="text-xs text-text-muted shrink-0">({patterns.length}件)</span>
          </div>
          <a
            href={`/practice-v2.html?student=${encodeURIComponent(studentName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary font-medium shrink-0"
          >
            教材を開く →
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-16">
        {patterns.length === 0 ? (
          <div className="text-center py-16 text-text-muted text-sm">
            <p>まだフレーズが登録されていません</p>
            <Link
              href="/teacher/lesson-form"
              className="mt-4 inline-block text-primary font-medium"
            >
              レッスン後フォームで追加 →
            </Link>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([cat, pats]) => (
            <div key={cat} className="mb-8">
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-1">{cat}</h2>
              <div className="space-y-3">
                {pats.map(p => (
                  <div
                    key={p.id}
                    className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]"
                  >
                    {p.raw_memo && (
                      <div className="mb-3">
                        <button
                          onClick={() => setMemoOpen(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                          className="text-[11px] text-text-muted hover:text-text-dark flex items-center gap-1"
                        >
                          <span>{memoOpen[p.id] ? '▾' : '▸'}</span>
                          元メモを{memoOpen[p.id] ? '閉じる' : '見る'}
                        </button>
                        {memoOpen[p.id] && (
                          <p className="mt-1 px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-[11px] text-text-muted whitespace-pre-wrap">
                            {p.raw_memo}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="space-y-2 mb-3">
                      <div>
                        <label className="block text-[10px] text-text-muted mb-1">Situation</label>
                        <input
                          value={val(p, 'situation')}
                          onChange={e => updateEdit(p.id, 'situation', e.target.value)}
                          className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark"
                          placeholder="（なし）"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-muted mb-1">Trigger（相手のセリフ）</label>
                        <input
                          value={val(p, 'fpp_question')}
                          onChange={e => updateEdit(p.id, 'fpp_question', e.target.value)}
                          className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm font-medium text-text-dark"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-muted mb-1">SPP（模範回答）</label>
                        <input
                          value={val(p, 'spp')}
                          onChange={e => updateEdit(p.id, 'spp', e.target.value)}
                          className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm font-semibold text-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-muted mb-1">Followup Question</label>
                        <input
                          value={val(p, 'followup_question')}
                          onChange={e => updateEdit(p.id, 'followup_question', e.target.value)}
                          className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark"
                          placeholder="（なし）"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-muted mb-1">Followup Answer</label>
                        <input
                          value={val(p, 'followup_answer')}
                          onChange={e => updateEdit(p.id, 'followup_answer', e.target.value)}
                          className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark"
                          placeholder="（なし）"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                      <div className="flex gap-1 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded-full ${p.has_trigger_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>T</span>
                        <span className={`px-1.5 py-0.5 rounded-full ${p.has_spp_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>S</span>
                        <span className={`px-1.5 py-0.5 rounded-full ${p.has_followup_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>FQ</span>
                        <span className={`px-1.5 py-0.5 rounded-full ${p.has_natural_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>FA</span>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {saveMsg[p.id] && (
                          <span className={`text-[10px] ${saveMsg[p.id].includes('失敗') ? 'text-error' : 'text-success'}`}>
                            {saveMsg[p.id]}
                          </span>
                        )}
                        <button
                          onClick={() => deletePattern(p.id)}
                          disabled={deleting === p.id || saving === p.id}
                          className="px-3 py-1.5 text-error/60 hover:text-error hover:bg-error/5 rounded-[var(--radius-button)] text-xs disabled:opacity-40 transition-colors"
                        >
                          {deleting === p.id ? '削除中…' : '削除'}
                        </button>
                        <button
                          onClick={() => savePattern(p)}
                          disabled={saving === p.id || !isDirty(p.id)}
                          className="px-3 py-1.5 bg-primary text-white rounded-[var(--radius-button)] text-xs font-semibold disabled:opacity-40 transition-opacity"
                        >
                          {saving === p.id ? '処理中…' : '保存 + 音声生成'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
