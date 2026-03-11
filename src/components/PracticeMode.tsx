'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Timer from './Timer';

interface Pattern {
  id: number;
  set_number: number;
  situation: string;
  fpp_intro: string | null;
  fpp_question: string;
  spp: string;
  character: string;
  has_fpp_intro_audio: boolean;
  has_fpp_question_audio: boolean;
  has_spp_audio: boolean;
}

type PracticeStep = 'situation' | 'fpp_intro' | 'fpp_question' | 'thinking' | 'answer';

interface PracticeModeProps {
  patterns: Pattern[];
  chunkTitle: string;
}

export default function PracticeMode({ patterns, chunkTitle }: PracticeModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState<PracticeStep>('situation');
  const [timerDuration, setTimerDuration] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const pattern = patterns[currentIndex];
  const totalPatterns = patterns.length;

  const playAudio = useCallback((patternId: number, audioType: string): Promise<void> => {
    return new Promise((resolve) => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(`/api/audio/${patternId}?type=${audioType}`);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, []);

  const advanceStep = useCallback(async () => {
    if (!pattern) return;

    switch (step) {
      case 'situation':
        // FPP前振りがあればそれを再生、なければFPP質問へ
        if (pattern.fpp_intro && pattern.has_fpp_intro_audio) {
          setStep('fpp_intro');
          await playAudio(pattern.id, 'fpp_intro');
          setStep('fpp_question');
          if (pattern.has_fpp_question_audio) {
            await playAudio(pattern.id, 'fpp_question');
          }
          setStep('thinking');
        } else if (pattern.has_fpp_question_audio) {
          setStep('fpp_question');
          await playAudio(pattern.id, 'fpp_question');
          setStep('thinking');
        } else {
          setStep('fpp_question');
        }
        break;

      case 'fpp_question':
        setStep('thinking');
        break;

      case 'thinking':
        setStep('answer');
        if (pattern.has_spp_audio) {
          await playAudio(pattern.id, 'spp');
        }
        break;

      case 'answer':
        // 次のパターンへ
        if (currentIndex < totalPatterns - 1) {
          setCurrentIndex(currentIndex + 1);
          setStep('situation');
        }
        break;
    }
  }, [step, pattern, currentIndex, totalPatterns, playAudio]);

  const handleTimerComplete = useCallback(() => {
    setStep('answer');
    if (pattern?.has_spp_audio) {
      playAudio(pattern.id, 'spp');
    }
  }, [pattern, playAudio]);

  const goBack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (step === 'situation' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setStep('situation');
    } else {
      setStep('situation');
    }
  }, [step, currentIndex]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advanceStep();
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advanceStep, goBack]);

  if (!pattern) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <p className="text-2xl font-bold text-white mb-4">練習完了!</p>
        <p className="text-zinc-400 mb-8">{totalPatterns}問すべて終わりました</p>
        <a
          href="/practice"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500"
        >
          カテゴリ選択に戻る
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[80vh]">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <a href="/practice" className="text-zinc-400 hover:text-white text-sm">← 戻る</a>
        <span className="text-sm text-zinc-400">{currentIndex + 1} / {totalPatterns}</span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-zinc-400 hover:text-white text-sm"
        >
          ⚙
        </button>
      </div>

      {/* 設定パネル */}
      {showSettings && (
        <div className="p-4 bg-zinc-900 border-b border-zinc-800">
          <label className="flex items-center gap-3 text-sm text-zinc-300">
            タイマー:
            <input
              type="range"
              min={3}
              max={15}
              value={timerDuration}
              onChange={(e) => setTimerDuration(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-right">{timerDuration}秒</span>
          </label>
        </div>
      )}

      {/* プログレスバー */}
      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((currentIndex) / totalPatterns) * 100}%` }}
        />
      </div>

      {/* メインコンテンツ */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 gap-6 cursor-pointer select-none"
        onClick={advanceStep}
      >
        {/* チャンクタイトル */}
        <p className="text-sm text-zinc-500 font-medium">{chunkTitle}</p>

        {/* シチュエーション（常に表示） */}
        <div className="text-center max-w-md">
          <p className="text-zinc-300 text-base leading-relaxed">
            {pattern.situation}
          </p>
        </div>

        {/* FPP前振り */}
        {(step === 'fpp_intro' || step === 'fpp_question' || step === 'thinking' || step === 'answer') &&
          pattern.fpp_intro && (
            <div className="text-center">
              <p className="text-zinc-500 text-xs mb-1">前振り</p>
              <p className="text-white text-lg italic">
                &ldquo;{pattern.fpp_intro}&rdquo;
              </p>
            </div>
          )}

        {/* FPP質問 */}
        {(step === 'fpp_question' || step === 'thinking' || step === 'answer') && (
          <div className="text-center">
            <p className="text-white text-xl font-semibold">
              &ldquo;{pattern.fpp_question}&rdquo;
            </p>
          </div>
        )}

        {/* タイマー */}
        {step === 'thinking' && (
          <Timer
            duration={timerDuration}
            onComplete={handleTimerComplete}
            isRunning={true}
          />
        )}

        {/* 正解（SPP） */}
        {step === 'answer' && (
          <div className="text-center bg-zinc-800 rounded-xl p-6 max-w-md w-full">
            <p className="text-green-400 text-xl font-bold">
              &ldquo;{pattern.spp}&rdquo;
            </p>
          </div>
        )}

        {/* 操作ヒント */}
        <div className="text-zinc-600 text-xs mt-4">
          {step === 'situation' && 'タップして開始'}
          {step === 'fpp_intro' && '音声再生中...'}
          {step === 'fpp_question' && (pattern.has_fpp_question_audio ? '音声再生中...' : 'タップして次へ')}
          {step === 'thinking' && 'タイマー終了を待つか、タップでスキップ'}
          {step === 'answer' && (currentIndex < totalPatterns - 1 ? 'タップで次へ' : 'タップで完了')}
        </div>
      </div>

      {/* 下部ナビ */}
      <div className="flex items-center justify-between p-4 border-t border-zinc-800">
        <button
          onClick={(e) => { e.stopPropagation(); goBack(); }}
          className="px-4 py-2 text-zinc-400 hover:text-white text-sm"
          disabled={currentIndex === 0 && step === 'situation'}
        >
          ← 前へ
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // リプレイ
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
            }
            setStep('situation');
          }}
          className="px-4 py-2 text-zinc-400 hover:text-white text-sm"
        >
          🔄 もう一度
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex < totalPatterns - 1) {
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
              }
              setCurrentIndex(currentIndex + 1);
              setStep('situation');
            }
          }}
          className="px-4 py-2 text-zinc-400 hover:text-white text-sm"
          disabled={currentIndex >= totalPatterns - 1}
        >
          次へ →
        </button>
      </div>
    </div>
  );
}
