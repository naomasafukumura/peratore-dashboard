'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Pattern {
  id: number;
  situation: string | null;
  fpp_intro: string | null;
  fpp_question: string;
  spp: string;
  has_fpp_intro_audio: boolean;
  has_fpp_question_audio: boolean;
  has_spp_audio: boolean;
}

type Step = 'ready' | 'fpp' | 'thinking' | 'answer';

interface Props {
  patterns: Pattern[];
  chunkTitle: string;
  chunkTitleJp: string;
}

export default function PracticeMode({ patterns, chunkTitle, chunkTitleJp }: Props) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('ready');
  const [timer, setTimer] = useState(5);
  const [timerActive, setTimerActive] = useState(false);
  const [timerDuration, setTimerDuration] = useState(5);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const pattern = patterns[index];
  const total = patterns.length;
  const progress = total > 0 ? ((index) / total) * 100 : 0;

  // タイマー
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      setTimerActive(false);
      setStep('answer');
      if (pattern?.has_spp_audio) {
        playAudio(pattern.id, 'spp');
      }
      return;
    }
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive, timer]);

  const playAudio = useCallback((patternId: number, type: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`/api/audio/${patternId}?type=${type}`);
    audioRef.current = audio;
    return new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, []);

  const handleTap = useCallback(async () => {
    if (!pattern) return;

    switch (step) {
      case 'ready': {
        setStep('fpp');
        // FPP前振りがあれば再生
        if (pattern.fpp_intro && pattern.has_fpp_intro_audio) {
          await playAudio(pattern.id, 'fpp_intro');
        }
        // FPP質問を再生
        if (pattern.has_fpp_question_audio) {
          await playAudio(pattern.id, 'fpp_question');
        }
        // タイマー開始
        setStep('thinking');
        setTimer(timerDuration);
        setTimerActive(true);
        break;
      }
      case 'fpp':
        break; // 再生中は何もしない
      case 'thinking': {
        // タイマースキップ
        setTimerActive(false);
        setStep('answer');
        if (pattern.has_spp_audio) {
          await playAudio(pattern.id, 'spp');
        }
        break;
      }
      case 'answer': {
        if (index < total - 1) {
          setIndex(index + 1);
          setStep('ready');
        }
        break;
      }
    }
  }, [step, pattern, index, total, playAudio, timerDuration]);

  // キーボード操作
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleTap]);

  // 完了画面
  if (!pattern) {
    return (
      <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-6">
          <span className="text-4xl">🎉</span>
        </div>
        <h2 className="text-2xl font-bold text-text-dark mb-2">練習完了!</h2>
        <p className="text-text-muted mb-8">{total}問すべて終わりました</p>
        <Link
          href="/practice"
          className="px-8 py-3 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-all"
        >
          チャンク選択に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-page flex flex-col">
      {/* ヘッダー */}
      <header className="bg-bg-card border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/practice" className="text-text-muted hover:text-text-dark text-sm transition-colors">← 戻る</Link>
          <span className="text-sm font-medium text-text-dark">{index + 1} / {total}</span>
          <button
            onClick={() => {
              const d = prompt('タイマー秒数を入力', String(timerDuration));
              if (d) setTimerDuration(parseInt(d) || 5);
            }}
            className="text-text-light hover:text-text-muted text-sm transition-colors"
          >
            ⚙ {timerDuration}秒
          </button>
        </div>
      </header>

      {/* プログレスバー */}
      <div className="h-1 bg-border">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* メイン */}
      <main
        className="flex-1 flex flex-col items-center justify-center px-6 py-8 cursor-pointer select-none"
        onClick={handleTap}
      >
        <div className="max-w-md w-full space-y-6 text-center">
          {/* チャンクタイトル */}
          <p className="text-xs text-primary font-semibold uppercase tracking-wider">{chunkTitle}</p>

          {/* シチュエーション */}
          {step === 'ready' && pattern.situation && (
            <div className="bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 border border-border">
              <p className="text-text-dark leading-relaxed">{pattern.situation}</p>
            </div>
          )}

          {/* Ready状態 */}
          {step === 'ready' && (
            <div className="py-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">▶</span>
              </div>
              <p className="text-text-light text-sm">タップして開始</p>
            </div>
          )}

          {/* FPP表示 */}
          {(step === 'fpp' || step === 'thinking' || step === 'answer') && (
            <div className="space-y-3">
              {pattern.fpp_intro && (
                <p className="text-text-muted italic">&ldquo;{pattern.fpp_intro}&rdquo;</p>
              )}
              <p className="text-xl font-semibold text-text-dark">
                &ldquo;{pattern.fpp_question}&rdquo;
              </p>
            </div>
          )}

          {/* タイマー */}
          {step === 'thinking' && (
            <div className="py-4">
              <div className="relative w-24 h-24 mx-auto">
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="42" fill="none" stroke="var(--border)" strokeWidth="4" />
                  <circle
                    cx="48" cy="48" r="42"
                    fill="none" stroke="var(--primary)" strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={264}
                    strokeDashoffset={264 * (1 - timer / timerDuration)}
                    transform="rotate(-90 48 48)"
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-primary">
                  {timer}
                </span>
              </div>
              <p className="text-text-light text-sm mt-3">英語で考えてみよう</p>
            </div>
          )}

          {/* 正解 */}
          {step === 'answer' && (
            <div className="bg-success/5 rounded-[var(--radius-card)] p-6 border border-success/20">
              <p className="text-xs text-success font-semibold mb-2">Answer</p>
              <p className="text-xl font-bold text-success">
                &ldquo;{pattern.spp}&rdquo;
              </p>
            </div>
          )}

          {/* ヒント */}
          <p className="text-text-light text-xs">
            {step === 'fpp' && '音声再生中...'}
            {step === 'thinking' && 'タップでスキップ'}
            {step === 'answer' && (index < total - 1 ? 'タップで次へ' : 'タップで完了')}
          </p>
        </div>
      </main>
    </div>
  );
}
