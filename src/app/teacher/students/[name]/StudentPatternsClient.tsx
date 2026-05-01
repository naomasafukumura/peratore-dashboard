'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Pattern {
  id: number;
  chunk_id: number;
  sort_order: number;
  situation: string | null;
  fpp_question: string;
  spp: string;
  followup_question: string | null;
  followup_answer: string | null;
  character: string;
  category_name: string;
  created_at: string | null;
  chunk_title_en: string | null;
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
  categories,
}: {
  studentName: string;
  initialPatterns: Pattern[];
  categories: { id: number; name: string }[];
}) {
  const [patterns, setPatterns] = useState<Pattern[]>(initialPatterns);
  const [edits, setEdits] = useState<Record<number, Edits>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const [memoOpen, setMemoOpen] = useState<Record<number, boolean>>({});
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const [categoryUpdating, setCategoryUpdating] = useState<number | null>(null);

  const toggleCard = (id: number) => setOpenCards(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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
      const res = await fetch(`/api/patterns/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`削除失敗: ${data.error ?? res.status}`);
        return;
      }
      setPatterns(prev => prev.filter(p => p.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const updateChunkCategory = async (chunkId: number, categoryId: number, categoryName: string) => {
    setCategoryUpdating(chunkId);
    try {
      const res = await fetch(`/api/chunks/${chunkId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`カテゴリ変更失敗: ${data.error ?? res.status}`);
        return;
      }
      // 同一チャンクの全パターンの category_name を一括更新
      setPatterns(prev =>
        prev.map(p => p.chunk_id === chunkId ? { ...p, category_name: categoryName } : p)
      );
    } finally {
      setCategoryUpdating(null);
    }
  };

  // チャンク単位でグループ化（順序を保持するため Map を使用）
  const grouped = new Map<number, Pattern[]>();
  for (const p of patterns) {
    if (!grouped.has(p.chunk_id)) grouped.set(p.chunk_id, []);
    grouped.get(p.chunk_id)!.push(p);
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

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
          <div className="space-y-3">
            {Array.from(grouped.entries()).map(([chunkId, pats]) => {
              const isMulti = pats.length > 1;
              const isChunkOpen = openCards.has(-chunkId);

              return (
                <div key={chunkId} className="bg-bg-card border border-border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden">
                  {/* チャンクヘッダー（複数パターンの場合のみ折りたたみボタン） */}
                  {isMulti && (
                    <button
                      type="button"
                      onClick={() => toggleCard(-chunkId)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-primary/5 hover:bg-primary/10 border-b border-border"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary truncate">
                          {pats[0].chunk_title_en || pats[0].fpp_question}
                          <span className="ml-2 text-text-muted font-normal">{pats.length}パターン</span>
                        </p>
                      </div>
                      <span className="text-text-muted text-xs shrink-0">{isChunkOpen ? '▼' : '▶'}</span>
                    </button>
                  )}

                  {/* カテゴリ選択UI（単体・複数共通、常に表示） */}
                  <div className={`px-4 py-2 flex items-center gap-2 ${isMulti ? 'border-b border-border/50' : ''}`}>
                    <span className="text-[10px] text-text-muted shrink-0">カテゴリ:</span>
                    <select
                      value={categories.find(c => c.name === pats[0].category_name)?.id ?? ''}
                      onChange={e => {
                        const id = parseInt(e.target.value, 10);
                        const cat = categories.find(c => c.id === id);
                        if (cat) updateChunkCategory(chunkId, cat.id, cat.name);
                      }}
                      disabled={categoryUpdating === chunkId}
                      className="text-[11px] px-2 py-1 bg-bg-page border border-border rounded-[var(--radius-button)] text-text-dark disabled:opacity-50"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {categoryUpdating === chunkId && (
                      <span className="text-[10px] text-text-muted">更新中…</span>
                    )}
                  </div>

                  {/* パターンリスト（単体は常に表示、複数は展開時のみ） */}
                  {(!isMulti || isChunkOpen) && (
                    <div className="px-4 pb-4 pt-3">
                      {/* 元メモ: チャンク先頭のパターンにだけ表示 */}
                      {pats[0].raw_memo && (
                        <div className="mb-4">
                          <button
                            onClick={() => setMemoOpen(prev => ({ ...prev, [pats[0].id]: !prev[pats[0].id] }))}
                            className="text-[11px] text-text-muted hover:text-text-dark flex items-center gap-1"
                          >
                            <span>{memoOpen[pats[0].id] ? '▾' : '▸'}</span>
                            元メモを{memoOpen[pats[0].id] ? '閉じる' : '見る'}
                          </button>
                          {memoOpen[pats[0].id] && (
                            <p className="mt-1 px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-[11px] text-text-muted whitespace-pre-wrap">
                              {pats[0].raw_memo}
                            </p>
                          )}
                        </div>
                      )}

                      {/* 各パターンのフィールド */}
                      <div className={isMulti ? 'space-y-5' : 'space-y-2'}>
                        {pats.map((p, pidx) => {
                          const fqVal = val(p, 'followup_question');
                          const faVal = val(p, 'followup_answer');
                          const hasFq = !!(p.followup_question || fqVal.trim());
                          const hasFa = !!(p.followup_answer || faVal.trim());
                          return (
                            <div key={p.id} className={isMulti ? 'pt-4 border-t border-border/50 first:border-t-0 first:pt-0' : ''}>
                              {isMulti && (
                                <p className="text-[10px] font-semibold text-text-muted mb-2">#{pidx + 1}</p>
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
                                {hasFq && (
                                  <div>
                                    <label className="block text-[10px] text-text-muted mb-1">Followup Question</label>
                                    <input
                                      value={fqVal}
                                      onChange={e => updateEdit(p.id, 'followup_question', e.target.value)}
                                      className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark"
                                    />
                                  </div>
                                )}
                                {hasFa && (
                                  <div>
                                    <label className="block text-[10px] text-text-muted mb-1">Followup Answer</label>
                                    <input
                                      value={faVal}
                                      onChange={e => updateEdit(p.id, 'followup_answer', e.target.value)}
                                      className="w-full px-3 py-1.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark"
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                                <div className="flex gap-1 text-[10px]">
                                  <span className={`px-1.5 py-0.5 rounded-full ${p.has_trigger_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>T</span>
                                  <span className={`px-1.5 py-0.5 rounded-full ${p.has_spp_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>S</span>
                                  {hasFq && <span className={`px-1.5 py-0.5 rounded-full ${p.has_followup_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>FQ</span>}
                                  {hasFa && <span className={`px-1.5 py-0.5 rounded-full ${p.has_natural_audio ? 'bg-success/10 text-success' : 'bg-border text-text-light'}`}>FA</span>}
                                  {p.created_at && (
                                    <span className="ml-2 text-text-light">{formatDate(p.created_at)}</span>
                                  )}
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
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
