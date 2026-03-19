'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { scoreTurn1Local, ScoreLevel } from '@/lib/scoring';
import ReviewOverlay from './ReviewOverlay';
import CompletionScreen from './CompletionScreen';
import SettingsOverlay from './SettingsOverlay';

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

type Step = 'ready' | 'listen' | 'think' | 'speak' | 'processing' | 'result' | 'review';

interface Props {
  patterns: Pattern[];
  chunkTitle: string;
  chunkTitleJp: string;
}

interface Stats {
  perfect: number;
  great: number;
  good: number;
  almost: number;
  retry: number;
}

export default function PracticeMode({ patterns, chunkTitle, chunkTitleJp }: Props) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('ready');
  const [timer, setTimer] = useState(5);
  const [timerActive, setTimerActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 設定（localStorage永続化）
  const [thinkTime, setThinkTime] = useState(5);
  const [speakTime, setSpeakTime] = useState(7);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');

  // 録音
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // テキスト入力
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  // 結果
  const [userAnswer, setUserAnswer] = useState('');
  const [scoreLevel, setScoreLevel] = useState<ScoreLevel>('good');
  const [chunkUsed, setChunkUsed] = useState(false);

  // 統計
  const [stats, setStats] = useState<Stats>({ perfect: 0, great: 0, good: 0, almost: 0, retry: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const pattern = patterns[index];
  const total = patterns.length;
  const progress = total > 0 ? ((index) / total) * 100 : 0;

  // localStorage読み込み
  useEffect(() => {
    const saved = localStorage.getItem('peratoreSettings');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.thinkTime) setThinkTime(s.thinkTime);
        if (s.speakTime) setSpeakTime(s.speakTime);
        if (s.inputMode) setInputMode(s.inputMode);
      } catch { /* ignore */ }
    }
  }, []);

  // localStorage保存
  useEffect(() => {
    localStorage.setItem('peratoreSettings', JSON.stringify({ thinkTime, speakTime, inputMode }));
  }, [thinkTime, speakTime, inputMode]);

  // タイマー
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      setTimerActive(false);
      startSpeakPhase();
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

  const startSpeakPhase = useCallback(() => {
    if (inputMode === 'text') {
      setStep('speak');
      setTextInput('');
      setTimeout(() => textInputRef.current?.focus(), 100);
    } else {
      setStep('speak');
      startRecording();
    }
  }, [inputMode]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processRecording(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      // 自動停止タイマー
      speakTimerRef.current = setTimeout(() => {
        stopRecording();
      }, speakTime * 1000);
    } catch {
      // マイクアクセス拒否 → テキストモードにフォールバック
      setInputMode('text');
      setStep('speak');
      setTextInput('');
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  }, [speakTime]);

  const stopRecording = useCallback(() => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const processRecording = useCallback(async (blob: Blob) => {
    setStep('processing');

    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');

      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      const text = data.text || '';
      setUserAnswer(text);
      await scoreAnswer(text);
    } catch {
      setUserAnswer('(認識エラー)');
      setScoreLevel('retry');
      setChunkUsed(false);
      setStep('result');
    }
  }, []);

  const scoreAnswer = useCallback(async (answer: string) => {
    if (!pattern) return;

    try {
      const res = await fetch('/api/score-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAnswer: answer,
          question: pattern.fpp_question,
          targetChunk: chunkTitle,
          exampleAnswer: pattern.spp,
        }),
      });
      const data = await res.json();

      if (data.fallback || !data.level) {
        // ローカルフォールバック
        const local = scoreTurn1Local(answer, pattern.spp, chunkTitle);
        setScoreLevel(local.level);
        setChunkUsed(local.chunkUsed);
      } else {
        setScoreLevel(data.level as ScoreLevel);
        setChunkUsed(data.chunkUsed ?? false);
      }
    } catch {
      const local = scoreTurn1Local(answer, pattern.spp, chunkTitle);
      setScoreLevel(local.level);
      setChunkUsed(local.chunkUsed);
    }

    setStep('result');
  }, [pattern, chunkTitle]);

  const handleTextSubmit = useCallback(() => {
    const answer = textInput.trim();
    if (!answer) return;
    setUserAnswer(answer);
    setStep('processing');
    scoreAnswer(answer);
  }, [textInput, scoreAnswer]);

  const showReview = useCallback(() => {
    setStep('review');
  }, []);

  const handleReRecord = useCallback(() => {
    setUserAnswer('');
    startSpeakPhase();
  }, [startSpeakPhase]);

  const handleNext = useCallback(() => {
    // 統計に追加
    setStats(prev => ({ ...prev, [scoreLevel]: prev[scoreLevel] + 1 }));

    if (index < total - 1) {
      setIndex(index + 1);
      setStep('ready');
      setUserAnswer('');
      setTextInput('');
    } else {
      // 最終問題 → 完了
      setIndex(index + 1);
    }
  }, [index, total, scoreLevel]);

  const handleStart = useCallback(async () => {
    if (!pattern) return;

    setStep('listen');

    // FPP前振りがあれば再生
    if (pattern.fpp_intro && pattern.has_fpp_intro_audio) {
      await playAudio(pattern.id, 'fpp_intro');
    }

    // FPP質問を再生
    if (pattern.has_fpp_question_audio) {
      await playAudio(pattern.id, 'fpp_question');
    }

    // タイマー開始
    setStep('think');
    setTimer(thinkTime);
    setTimerActive(true);
  }, [pattern, playAudio, thinkTime]);

  const skipTimer = useCallback(() => {
    setTimerActive(false);
    startSpeakPhase();
  }, [startSpeakPhase]);

  // キーボード操作
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSettings) return;
      if (step === 'speak' && inputMode === 'text') return; // テキスト入力中

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        switch (step) {
          case 'ready': handleStart(); break;
          case 'think': skipTimer(); break;
          case 'speak': if (inputMode === 'voice') stopRecording(); break;
          case 'result': showReview(); break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, inputMode, showSettings, handleStart, skipTimer, stopRecording, showReview]);

  // 完了画面
  if (index >= total) {
    return (
      <CompletionScreen
        total={total}
        stats={stats}
        chunkTitle={chunkTitle}
      />
    );
  }

  if (!pattern) return null;

  return (
    <div className="min-h-screen bg-bg-page flex flex-col">
      {/* ヘッダー */}
      <header className="bg-bg-card border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/practice" className="text-text-muted hover:text-text-dark text-sm transition-colors">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <span className="text-sm font-medium text-text-dark">{index + 1} / {total}</span>
          <button
            onClick={() => setShowSettings(true)}
            className="text-text-light hover:text-text-muted text-sm transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M16.5 10a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
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
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="max-w-md w-full space-y-6 text-center">
          {/* チャンクタイトル */}
          <p className="text-xs text-primary font-bold uppercase tracking-wider">{chunkTitle}</p>

          {/* シチュエーション */}
          {pattern.situation && (step === 'ready' || step === 'listen') && (
            <div className="bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 border border-border">
              <p className="text-text-dark text-sm leading-relaxed">{pattern.situation}</p>
            </div>
          )}

          {/* Ready状態 */}
          {step === 'ready' && (
            <div className="py-8">
              <button
                onClick={handleStart}
                className="w-20 h-20 rounded-full bg-cta text-white flex items-center justify-center mx-auto mb-4 shadow-lg hover:opacity-90 active:scale-95 transition-all"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
              <p className="text-text-light text-sm">タップして開始</p>
            </div>
          )}

          {/* Listen - FPP再生中 */}
          {step === 'listen' && (
            <div className="py-8">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)">
                  <rect x="4" y="8" width="3" height="8" rx="1.5"><animate attributeName="height" values="8;14;8" dur="0.6s" repeatCount="indefinite"/><animate attributeName="y" values="8;5;8" dur="0.6s" repeatCount="indefinite"/></rect>
                  <rect x="10.5" y="5" width="3" height="14" rx="1.5"><animate attributeName="height" values="14;8;14" dur="0.6s" repeatCount="indefinite"/><animate attributeName="y" values="5;8;5" dur="0.6s" repeatCount="indefinite"/></rect>
                  <rect x="17" y="8" width="3" height="8" rx="1.5"><animate attributeName="height" values="8;14;8" dur="0.6s" repeatCount="indefinite" begin="0.15s"/><animate attributeName="y" values="8;5;8" dur="0.6s" repeatCount="indefinite" begin="0.15s"/></rect>
                </svg>
              </div>
              <p className="text-text-muted text-sm">音声再生中...</p>
            </div>
          )}

          {/* FPP質問表示（think / speak / processing / result） */}
          {(step === 'think' || step === 'speak' || step === 'processing' || step === 'result') && (
            <div className="space-y-3">
              {pattern.fpp_intro && (
                <p className="text-text-muted text-sm italic">&ldquo;{pattern.fpp_intro}&rdquo;</p>
              )}
              <p className="text-lg font-semibold text-text-dark">
                {pattern.fpp_question}
              </p>
            </div>
          )}

          {/* Think - タイマー */}
          {step === 'think' && (
            <div className="py-4">
              <button onClick={skipTimer} className="relative w-24 h-24 mx-auto block">
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="42" fill="none" stroke="var(--border)" strokeWidth="4" />
                  <circle
                    cx="48" cy="48" r="42"
                    fill="none" stroke="var(--primary)" strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={264}
                    strokeDashoffset={264 * (1 - timer / thinkTime)}
                    transform="rotate(-90 48 48)"
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-primary">
                  {timer}
                </span>
              </button>
              <p className="text-text-light text-sm mt-3">英語で考えてみよう（タップでスキップ）</p>
            </div>
          )}

          {/* Speak - 録音中 or テキスト入力 */}
          {step === 'speak' && (
            <div className="py-4">
              {inputMode === 'voice' ? (
                <>
                  <button
                    onClick={stopRecording}
                    className="w-20 h-20 rounded-full bg-error text-white flex items-center justify-center mx-auto mb-4 shadow-lg animate-pulse"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  </button>
                  <p className="text-error text-sm font-medium">録音中... タップで完了</p>
                </>
              ) : (
                <div className="space-y-3">
                  <input
                    ref={textInputRef}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleTextSubmit();
                      }
                    }}
                    placeholder="英語で入力..."
                    className="w-full px-4 py-3 bg-bg-card border border-border rounded-[var(--radius-button)] text-text-dark text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    autoFocus
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="px-6 py-2.5 bg-cta text-white rounded-[var(--radius-button)] text-sm font-medium disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    送信
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Processing */}
          {step === 'processing' && (
            <div className="py-8">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-text-muted text-sm">認識中...</p>
            </div>
          )}

          {/* Result */}
          {step === 'result' && (
            <div className="space-y-4">
              {/* ユーザーの回答 */}
              <div className="bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-4 border border-border">
                <p className="text-xs text-text-muted mb-1">Your answer</p>
                <p className="text-text-dark font-medium">{userAnswer || '(何も認識されませんでした)'}</p>
              </div>

              {/* 模範回答 */}
              <div className="bg-success/5 rounded-[var(--radius-card)] p-4 border border-success/20">
                <p className="text-xs text-success font-semibold mb-1">Model answer</p>
                <p className="text-success font-bold">{pattern.spp}</p>
              </div>

              {/* SPP音声再生 */}
              {pattern.has_spp_audio && (
                <button
                  onClick={() => playAudio(pattern.id, 'spp')}
                  className="text-sm text-primary hover:text-primary-dark font-medium transition-colors"
                >
                  音声を再生
                </button>
              )}

              {/* レビューへ */}
              <button
                onClick={showReview}
                className="w-full py-3 bg-cta text-white rounded-[var(--radius-button)] font-medium hover:opacity-90 active:scale-[0.98] transition-all"
              >
                結果を確認
              </button>
            </div>
          )}
        </div>
      </main>

      {/* フェーズインジケーター */}
      <div className="bg-bg-card border-t border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex justify-center gap-6 text-xs">
          {(['listen', 'think', 'speak', 'result'] as Step[]).map((s) => {
            const labels: Record<string, string> = {
              listen: '聞く',
              think: '考える',
              speak: '話す',
              result: '結果',
            };
            const stepOrder = ['listen', 'think', 'speak', 'processing', 'result', 'review'];
            const currentIndex = stepOrder.indexOf(step);
            const thisIndex = stepOrder.indexOf(s);
            const isActive = step === s || (s === 'result' && (step === 'processing' || step === 'review'));
            const isDone = thisIndex < currentIndex && !isActive;

            return (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-all ${
                  isActive ? 'bg-primary scale-125' : isDone ? 'bg-success' : 'bg-border'
                }`} />
                <span className={`transition-colors ${
                  isActive ? 'text-primary font-medium' : isDone ? 'text-success' : 'text-text-light'
                }`}>
                  {labels[s]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review Overlay */}
      {step === 'review' && (
        <ReviewOverlay
          userAnswer={userAnswer}
          expectedAnswer={pattern.spp}
          fppQuestion={pattern.fpp_question}
          level={scoreLevel}
          chunkUsed={chunkUsed}
          chunkTitle={chunkTitle}
          onReRecord={handleReRecord}
          onNext={handleNext}
        />
      )}

      {/* Settings Overlay */}
      {showSettings && (
        <SettingsOverlay
          thinkTime={thinkTime}
          speakTime={speakTime}
          inputMode={inputMode}
          onThinkTimeChange={setThinkTime}
          onSpeakTimeChange={setSpeakTime}
          onInputModeChange={setInputMode}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
