'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Chunk {
  id: number;
  chunkNumber: number;
  titleEn: string;
  titleJp: string;
  patternCount: number;
}

interface Category {
  id: number;
  type: string;
  name: string;
  chunks: Chunk[];
}

interface Pattern {
  id: number;
  set_number: number;
  situation: string | null;
  fpp_intro: string | null;
  fpp_question: string;
  spp: string;
  character: string;
  has_fpp_intro_audio: boolean;
  has_fpp_question_audio: boolean;
  has_spp_audio: boolean;
}

interface Props {
  categories: Category[];
  stats: { pattern_count: number; audio_pattern_count: number };
}

export default function TeacherClient({ categories: initialCategories, stats }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(false);

  // 新規パターン入力
  const [fppIntro, setFppIntro] = useState('');
  const [fppQuestion, setFppQuestion] = useState('');
  const [spp, setSpp] = useState('');
  const [situation, setSituation] = useState('');
  const [saving, setSaving] = useState(false);

  // 音声生成
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  // チャンク追加
  const [showAddChunk, setShowAddChunk] = useState(false);
  const [newChunkTitleEn, setNewChunkTitleEn] = useState('');
  const [newChunkTitleJp, setNewChunkTitleJp] = useState('');
  const [newChunkCategoryId, setNewChunkCategoryId] = useState<number | null>(null);
  const [savingChunk, setSavingChunk] = useState(false);

  const reloadCategories = async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    setCategories(data);
  };

  const addChunk = async () => {
    if (!newChunkTitleEn.trim() || !newChunkCategoryId) return;
    setSavingChunk(true);

    const res = await fetch('/api/chunks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: newChunkCategoryId,
        titleEn: newChunkTitleEn.trim(),
        titleJp: newChunkTitleJp.trim() || '',
      }),
    });

    if (res.ok) {
      await reloadCategories();
      setNewChunkTitleEn('');
      setNewChunkTitleJp('');
      setShowAddChunk(false);
    }
    setSavingChunk(false);
  };

  const loadPatterns = async (chunk: Chunk) => {
    setSelectedChunk(chunk);
    setLoading(true);
    const res = await fetch(`/api/patterns?chunkId=${chunk.id}`);
    const data = await res.json();
    setPatterns(data.patterns);
    setLoading(false);
  };

  const addPattern = async () => {
    if (!fppQuestion.trim() || !spp.trim() || !selectedChunk) return;
    setSaving(true);

    const res = await fetch('/api/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunkId: selectedChunk.id,
        setNumber: patterns.length + 1,
        situation: situation.trim() || null,
        fppIntro: fppIntro.trim() || null,
        fppQuestion: fppQuestion.trim(),
        spp: spp.trim(),
      }),
    });

    if (res.ok) {
      // リロード
      await loadPatterns(selectedChunk);
      setFppIntro('');
      setFppQuestion('');
      setSpp('');
      setSituation('');
    }
    setSaving(false);
  };

  const generateAudio = async (patternId: number) => {
    setGeneratingId(patternId);
    try {
      await fetch('/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patternId }),
      });
      if (selectedChunk) await loadPatterns(selectedChunk);
    } catch (err) {
      alert('音声生成エラー: ' + (err as Error).message);
    }
    setGeneratingId(null);
  };

  const deletePattern = async (patternId: number) => {
    if (!confirm('このパターンを削除しますか？')) return;
    await fetch(`/api/patterns/${patternId}`, { method: 'DELETE' });
    if (selectedChunk) await loadPatterns(selectedChunk);
  };

  // タイプでグルーピング
  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const existing = grouped.get(cat.type) || [];
    existing.push(cat);
    grouped.set(cat.type, existing);
  }

  return (
    <div className="min-h-screen bg-bg-page">
      {/* ヘッダー */}
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-text-muted hover:text-text-dark transition-colors">←</Link>
            <h1 className="text-lg font-bold text-text-dark">先生ダッシュボード</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <span>{stats.pattern_count} パターン</span>
            <span className="text-success">{stats.audio_pattern_count} 音声済</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 flex gap-6 mt-4">
        {/* 左: チャンク選択 */}
        <aside className="w-72 shrink-0 hidden md:block">
          <div className="sticky top-20">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">チャンク選択</h2>
              <button
                onClick={() => setShowAddChunk(!showAddChunk)}
                className="text-xs text-primary hover:text-primary-dark font-medium transition-colors"
              >
                {showAddChunk ? '閉じる' : '+ 追加'}
              </button>
            </div>

            {/* チャンク追加フォーム */}
            {showAddChunk && (
              <div className="bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-4 mb-4 border border-border">
                <div className="space-y-2">
                  <select
                    value={newChunkCategoryId || ''}
                    onChange={(e) => setNewChunkCategoryId(parseInt(e.target.value) || null)}
                    className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark"
                  >
                    <option value="">カテゴリを選択...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.type} / {cat.name}</option>
                    ))}
                  </select>
                  <input
                    value={newChunkTitleEn}
                    onChange={(e) => setNewChunkTitleEn(e.target.value)}
                    placeholder="英語タイトル (例: I'm gonna ~)"
                    className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <input
                    value={newChunkTitleJp}
                    onChange={(e) => setNewChunkTitleJp(e.target.value)}
                    placeholder="日本語（任意: 〜する予定だよ）"
                    className="w-full px-3 py-2 bg-bg-page border border-border rounded-[var(--radius-button)] text-xs text-text-dark placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <button
                    onClick={addChunk}
                    disabled={savingChunk || !newChunkTitleEn.trim() || !newChunkCategoryId}
                    className="w-full px-3 py-2 bg-primary text-white rounded-[var(--radius-button)] text-xs font-medium hover:bg-primary-dark disabled:opacity-40 transition-all"
                  >
                    {savingChunk ? '追加中...' : 'チャンクを追加'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto pr-2">
              {Array.from(grouped.entries()).map(([type, cats]) => (
                <div key={type}>
                  <p className="text-xs font-semibold text-primary mb-1 px-1">{type}</p>
                  {cats.map((cat) => (
                    <div key={cat.id} className="mb-2">
                      <p className="text-xs text-text-muted px-1 mb-1">{cat.name}</p>
                      {cat.chunks.map((chunk) => (
                        <button
                          key={chunk.id}
                          onClick={() => loadPatterns(chunk)}
                          className={`w-full text-left px-3 py-2 rounded-[var(--radius-button)] text-sm transition-all mb-0.5
                            ${selectedChunk?.id === chunk.id
                              ? 'bg-primary text-white shadow-[var(--shadow-card)]'
                              : 'text-text-dark hover:bg-primary/5'
                            }`}
                        >
                          <span className="block font-medium truncate">{chunk.titleEn}</span>
                          <span className={`text-xs ${selectedChunk?.id === chunk.id ? 'text-white/70' : 'text-text-light'}`}>
                            {chunk.patternCount}問
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* モバイル: チャンク選択ドロップダウン */}
        <div className="md:hidden w-full mb-4">
          <select
            onChange={(e) => {
              const chunkId = parseInt(e.target.value);
              const allChunks = categories.flatMap(c => c.chunks);
              const chunk = allChunks.find(ch => ch.id === chunkId);
              if (chunk) loadPatterns(chunk);
            }}
            className="w-full px-4 py-3 bg-bg-card border border-border rounded-[var(--radius-button)] text-text-dark text-sm"
            defaultValue=""
          >
            <option value="" disabled>チャンクを選択...</option>
            {categories.map((cat) => (
              <optgroup key={cat.id} label={`${cat.type} / ${cat.name}`}>
                {cat.chunks.map((chunk) => (
                  <option key={chunk.id} value={chunk.id}>
                    {chunk.titleEn} ({chunk.patternCount}問)
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 右: メインコンテンツ */}
        <main className="flex-1 min-w-0">
          {!selectedChunk ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <span className="text-2xl">👈</span>
              </div>
              <p className="text-text-muted">左からチャンクを選んでください</p>
            </div>
          ) : (
            <>
              {/* チャンクヘッダー */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-dark">{selectedChunk.titleEn}</h2>
                {selectedChunk.titleJp && (
                  <p className="text-text-muted text-sm mt-1">{selectedChunk.titleJp}</p>
                )}
              </div>

              {/* 新規パターン追加フォーム */}
              <div className="bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 mb-6 border border-border">
                <h3 className="text-sm font-semibold text-text-dark mb-4">パターンを追加</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Situation（任意）</label>
                    <input
                      value={situation}
                      onChange={(e) => setSituation(e.target.value)}
                      placeholder="例: 同僚に週末の予定を聞かれた。"
                      className="w-full px-4 py-2.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">FPP 前振り（任意）</label>
                    <input
                      value={fppIntro}
                      onChange={(e) => setFppIntro(e.target.value)}
                      placeholder="例: So it's the weekend soon."
                      className="w-full px-4 py-2.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">FPP 質問 <span className="text-error">*</span></label>
                    <input
                      value={fppQuestion}
                      onChange={(e) => setFppQuestion(e.target.value)}
                      placeholder="例: What are you gonna do?"
                      className="w-full px-4 py-2.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">SPP 回答 <span className="text-error">*</span></label>
                    <input
                      value={spp}
                      onChange={(e) => setSpp(e.target.value)}
                      placeholder="例: I'm gonna go see my parents."
                      className="w-full px-4 py-2.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>
                  <button
                    onClick={addPattern}
                    disabled={saving || !fppQuestion.trim() || !spp.trim()}
                    className="w-full px-4 py-3 bg-primary text-white rounded-[var(--radius-button)] font-medium text-sm hover:bg-primary-dark active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {saving ? '追加中...' : 'パターンを追加'}
                  </button>
                </div>
              </div>

              {/* 登録済みパターン一覧 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-text-muted">
                  登録済み ({patterns.length}問)
                </h3>
                {loading ? (
                  <div className="py-12 text-center text-text-light">読み込み中...</div>
                ) : patterns.length === 0 ? (
                  <div className="py-12 text-center text-text-light">まだパターンがありません</div>
                ) : (
                  patterns.map((p) => (
                    <div
                      key={p.id}
                      className="bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 border border-border"
                    >
                      {p.situation && (
                        <p className="text-xs text-text-light mb-2">{p.situation}</p>
                      )}
                      {p.fpp_intro && (
                        <p className="text-sm text-text-muted italic mb-1">&ldquo;{p.fpp_intro}&rdquo;</p>
                      )}
                      <p className="text-base font-medium text-text-dark mb-1">
                        &ldquo;{p.fpp_question}&rdquo;
                      </p>
                      <p className="text-base font-semibold text-primary">
                        &ldquo;{p.spp}&rdquo;
                      </p>

                      {/* アクション */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                        <div className="flex gap-1 text-xs">
                          {p.has_fpp_question_audio && <span className="px-2 py-0.5 bg-success/10 text-success rounded-full">FPP</span>}
                          {p.has_spp_audio && <span className="px-2 py-0.5 bg-success/10 text-success rounded-full">SPP</span>}
                        </div>
                        <div className="ml-auto flex gap-2">
                          {(!p.has_fpp_question_audio || !p.has_spp_audio) && (
                            <button
                              onClick={() => generateAudio(p.id)}
                              disabled={generatingId === p.id}
                              className="px-3 py-1.5 bg-primary/10 text-primary rounded-[var(--radius-button)] text-xs font-medium hover:bg-primary/20 disabled:opacity-50 transition-all"
                            >
                              {generatingId === p.id ? '生成中...' : '音声生成'}
                            </button>
                          )}
                          <button
                            onClick={() => deletePattern(p.id)}
                            className="px-3 py-1.5 text-error/60 hover:text-error hover:bg-error/5 rounded-[var(--radius-button)] text-xs transition-all"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
