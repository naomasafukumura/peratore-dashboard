'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { scoreTurn1Local, ScoreLevel } from '@/lib/scoring';
import CompletionScreen from './CompletionScreen';
import SettingsOverlay from './SettingsOverlay';

interface Pattern {
  id: number;
  situation: string | null;
  fpp_intro: string | null;
  fpp_question: string;
  spp: string;
  spp_jp: string | null;
  followup_question: string | null;
  followup_answer: string | null;
  followup_answer_jp: string | null;
  has_fpp_intro_audio: boolean;
  has_fpp_question_audio: boolean;
  has_spp_audio: boolean;
  has_followup_audio: boolean;
}

// 内部フェーズ（Turn1 + Turn2の全ステート）
type Phase =
  | 'idle'
  | 'listen1'        // FPP音声再生中
  | 'think'          // 考える時間
  | 'micReady1'      // マイク準備 or テキスト入力待ち
  | 'speak1'         // 録音中
  | 'processing1'    // Whisper認識中
  | 'check1'         // 認識結果確認（Re-record / OK）
  | 'scoring1'       // スコアリング中
  | 'result1'        // Turn1結果表示（レビューカード）
  | 'transition2'    // Turn2への遷移
  | 'listen2'        // フォローアップ音声再生
  | 'micReady2'      // Turn2マイク準備
  | 'speak2'         // Turn2録音
  | 'processing2'    // Turn2 Whisper認識中
  | 'selfEval'       // 自己評価（できた/Replay/できなかった）
  | 'complete';      // 全パターン完了

// UIフェーズインジケーター用
type UiPhase = 'listen' | 'think' | 'speak' | 'check' | 'continue';

interface ChatMessage {
  id: string;
  speaker: 'opponent' | 'user' | 'system';
  text: string;
  textJp?: string;
  scoreLevel?: ScoreLevel;
  isModelAnswer?: boolean;
}

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

const LEVEL_CONFIG: Record<ScoreLevel, { label: string; color: string; bg: string; emoji: string }> = {
  perfect: { label: 'Perfect!', color: 'text-success', bg: 'bg-success/10', emoji: '🎯' },
  great: { label: 'Great!', color: 'text-emerald-500', bg: 'bg-emerald-50', emoji: '👏' },
  good: { label: 'Good', color: 'text-blue-500', bg: 'bg-blue-50', emoji: '👍' },
  almost: { label: 'Almost', color: 'text-amber-500', bg: 'bg-amber-50', emoji: '💪' },
  retry: { label: 'Retry', color: 'text-error', bg: 'bg-error/10', emoji: '🔄' },
};

// コンフェッティ生成
function spawnConfetti() {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:hidden;';
  document.body.appendChild(container);

  const colors = ['#F2B807', '#00b894', '#e17055', '#6c5ce7', '#fd79a8', '#00cec9'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    const size = 5 + Math.random() * 6;
    el.style.cssText = `
      position:absolute;top:-10px;left:${Math.random()*100}%;
      width:${size}px;height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>0.5?'50%':'2px'};
      animation:confetti-fall ${2+Math.random()*2}s linear ${Math.random()*0.8}s forwards;
    `;
    container.appendChild(el);
  }
  setTimeout(() => container.remove(), 4000);
}

// リアクションポップアップ
function showReactionPopup(text: string) {
  const el = document.createElement('div');
  el.textContent = text;
  el.className = 'animate-reaction-pop';
  el.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:2rem;font-weight:bold;z-index:101;pointer-events:none;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

const REACTIONS: Record<string, string[]> = {
  perfect: ['Perfect!!', 'Awesome!!', 'Amazing!', 'Nailed it!'],
  great: ['Great!!', 'Nice one!', 'Sounds good!', 'Love it!'],
  good: ['Good!', 'Not bad!', 'Getting there!'],
  almost: ['Almost!', 'Close!', 'Keep going!'],
  retry: ['One more time!', 'Try again!', "Let's try again!"],
};

export default function PracticeMode({ patterns, chunkTitle, chunkTitleJp }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [timer, setTimer] = useState(5);
  const [timerActive, setTimerActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 設定
  const [thinkTime, setThinkTime] = useState(5);
  const [speakTime, setSpeakTime] = useState(7);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [turn2Mode, setTurn2Mode] = useState<'listen' | 'speak'>('speak');

  // チャットメッセージ
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 録音
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // テキスト入力
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  // Turn 1結果
  const [userAnswer, setUserAnswer] = useState('');
  const [scoreLevel, setScoreLevel] = useState<ScoreLevel>('good');
  const [chunkUsed, setChunkUsed] = useState(false);

  // Turn 2結果
  const [userAnswer2, setUserAnswer2] = useState('');

  // 翻訳表示
  const [showJpId, setShowJpId] = useState<string | null>(null);

  // 統計
  const [stats, setStats] = useState<Stats>({ perfect: 0, great: 0, good: 0, almost: 0, retry: 0 });
  const [cardResults, setCardResults] = useState<{ turn1: ScoreLevel | null; turn2: string | null }[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const pattern = patterns[index];
  const total = patterns.length;
  const progress = total > 0 ? (index / total) * 100 : 0;
  const hasTurn2 = !!(pattern?.followup_question);

  // UIフェーズマッピング
  const uiPhase: UiPhase | null = (() => {
    switch (phase) {
      case 'listen1': return 'listen';
      case 'think': return 'think';
      case 'micReady1': case 'speak1': case 'processing1': return 'speak';
      case 'check1': case 'scoring1': case 'result1': return 'check';
      case 'transition2': case 'listen2': case 'micReady2': case 'speak2':
      case 'processing2': case 'selfEval': return 'continue';
      default: return null;
    }
  })();

  // localStorage
  useEffect(() => {
    const saved = localStorage.getItem('peratoreSettings');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.thinkTime) setThinkTime(s.thinkTime);
        if (s.speakTime) setSpeakTime(s.speakTime);
        if (s.inputMode) setInputMode(s.inputMode);
        if (s.turn2Mode) setTurn2Mode(s.turn2Mode);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('peratoreSettings', JSON.stringify({ thinkTime, speakTime, inputMode, turn2Mode }));
  }, [thinkTime, speakTime, inputMode, turn2Mode]);

  // チャット自動スクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  // タイマー
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      setTimerActive(false);
      enterSpeakPhase(1);
      return;
    }
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive, timer]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: `msg-${Date.now()}-${Math.random()}` }]);
  }, []);

  const playAudio = useCallback((patternId: number, type: string): Promise<void> => {
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

  // === Turn 1 フロー ===

  const handleStart = useCallback(async () => {
    if (!pattern) return;
    setMessages([]);
    setUserAnswer('');
    setUserAnswer2('');

    setPhase('listen1');

    // FPP前振り再生
    if (pattern.fpp_intro && pattern.has_fpp_intro_audio) {
      await playAudio(pattern.id, 'fpp_intro');
    }

    // FPP質問をチャットに追加
    addMessage({
      speaker: 'opponent',
      text: pattern.fpp_question,
      textJp: pattern.situation || undefined,
    });

    // FPP質問音声再生
    if (pattern.has_fpp_question_audio) {
      await playAudio(pattern.id, 'fpp_question');
    }

    // Think フェーズ
    setPhase('think');
    setTimer(thinkTime);
    setTimerActive(true);
  }, [pattern, playAudio, addMessage, thinkTime]);

  const enterSpeakPhase = useCallback((turn: 1 | 2) => {
    const phasePrefix = turn === 1 ? 'micReady1' : 'micReady2';
    setPhase(phasePrefix as Phase);
    setTextInput('');

    if (inputMode === 'text') {
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  }, [inputMode]);

  const startRecording = useCallback(async (turn: 1 | 2) => {
    const speakPhase = turn === 1 ? 'speak1' : 'speak2';
    setPhase(speakPhase as Phase);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processRecording(blob, turn);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      speakTimerRef.current = setTimeout(() => stopRecording(), speakTime * 1000);
    } catch {
      // マイクアクセス拒否 → テキストにフォールバック
      setInputMode('text');
      enterSpeakPhase(turn);
    }
  }, [speakTime, enterSpeakPhase]);

  const stopRecording = useCallback(() => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const processRecording = useCallback(async (blob: Blob, turn: 1 | 2) => {
    const procPhase = turn === 1 ? 'processing1' : 'processing2';
    setPhase(procPhase as Phase);

    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      const text = data.text || '';

      if (turn === 1) {
        setUserAnswer(text);
        // チェックステップへ（Re-record / OK）
        addMessage({ speaker: 'user', text: text || '(認識できませんでした)' });
        setPhase('check1');
      } else {
        setUserAnswer2(text);
        addMessage({ speaker: 'user', text: text || '(認識できませんでした)' });
        setPhase('selfEval');
      }
    } catch {
      if (turn === 1) {
        setUserAnswer('(認識エラー)');
        addMessage({ speaker: 'user', text: '(認識エラー)' });
        setPhase('check1');
      } else {
        setUserAnswer2('(認識エラー)');
        addMessage({ speaker: 'user', text: '(認識エラー)' });
        setPhase('selfEval');
      }
    }
  }, [addMessage]);

  const handleTextSubmit = useCallback((turn: 1 | 2) => {
    const answer = textInput.trim();
    if (!answer) return;

    if (turn === 1) {
      setUserAnswer(answer);
      addMessage({ speaker: 'user', text: answer });
      setPhase('check1');
    } else {
      setUserAnswer2(answer);
      addMessage({ speaker: 'user', text: answer });
      setPhase('selfEval');
    }
    setTextInput('');
  }, [textInput, addMessage]);

  // Check1: Re-record
  const handleReRecord = useCallback(() => {
    // 最後のユーザーメッセージを削除
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.speaker === 'user');
      if (idx === -1) return prev;
      const removeIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== removeIdx);
    });
    setUserAnswer('');
    enterSpeakPhase(1);
  }, [enterSpeakPhase]);

  // Check1: OK → スコアリング
  const handleAccept = useCallback(async () => {
    if (!pattern) return;
    setPhase('scoring1');

    let level: ScoreLevel;
    let used: boolean;

    try {
      const res = await fetch('/api/score-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAnswer,
          question: pattern.fpp_question,
          targetChunk: chunkTitle,
          exampleAnswer: pattern.spp,
        }),
      });
      const data = await res.json();

      if (data.fallback || !data.level) {
        const local = scoreTurn1Local(userAnswer, pattern.spp, chunkTitle);
        level = local.level;
        used = local.chunkUsed;
      } else {
        level = data.level as ScoreLevel;
        used = data.chunkUsed ?? false;
      }
    } catch {
      const local = scoreTurn1Local(userAnswer, pattern.spp, chunkTitle);
      level = local.level;
      used = local.chunkUsed;
    }

    setScoreLevel(level);
    setChunkUsed(used);

    // リアクション
    const texts = REACTIONS[level] || REACTIONS.good;
    showReactionPopup(texts[Math.floor(Math.random() * texts.length)]);
    if (level === 'perfect' || level === 'great') {
      spawnConfetti();
    }

    // 模範回答をチャットに追加
    addMessage({
      speaker: 'opponent',
      text: pattern.spp,
      textJp: pattern.spp_jp || undefined,
      isModelAnswer: true,
    });

    // SPP音声再生
    if (pattern.has_spp_audio) {
      await playAudio(pattern.id, 'spp');
    }

    setPhase('result1');
  }, [pattern, userAnswer, chunkTitle, addMessage, playAudio]);

  // Result1 → Turn2 or 次のカード
  const handleResult1Continue = useCallback(() => {
    if (hasTurn2) {
      startTurn2();
    } else {
      goToNextCard();
    }
  }, [hasTurn2]);

  // === Turn 2 フロー ===

  const startTurn2 = useCallback(async () => {
    if (!pattern?.followup_question) return;
    setPhase('transition2');

    await new Promise(r => setTimeout(r, 600));

    // フォローアップ質問をチャットに追加
    addMessage({
      speaker: 'opponent',
      text: pattern.followup_question,
    });

    setPhase('listen2');

    // フォローアップ音声再生
    if (pattern.has_followup_audio) {
      await playAudio(pattern.id, 'followup_question');
    }

    if (turn2Mode === 'listen') {
      // 聞くだけモード → 模範回答表示して次へ
      if (pattern.followup_answer) {
        addMessage({
          speaker: 'system',
          text: pattern.followup_answer,
          textJp: pattern.followup_answer_jp || undefined,
          isModelAnswer: true,
        });
      }
      await new Promise(r => setTimeout(r, 1500));
      goToNextCard();
    } else {
      enterSpeakPhase(2);
    }
  }, [pattern, playAudio, addMessage, turn2Mode, enterSpeakPhase]);

  // Self-eval
  const handleSelfEval = useCallback((eval_: 'good' | 'couldnt') => {
    // 模範回答表示
    if (pattern?.followup_answer) {
      addMessage({
        speaker: 'system',
        text: pattern.followup_answer,
        textJp: pattern.followup_answer_jp || undefined,
        isModelAnswer: true,
      });
    }

    setCardResults(prev => [...prev, { turn1: scoreLevel, turn2: eval_ }]);
    setTimeout(() => goToNextCard(), 800);
  }, [pattern, scoreLevel, addMessage]);

  // === カード遷移 ===

  const goToNextCard = useCallback(() => {
    // Turn1の統計に追加
    setStats(prev => ({ ...prev, [scoreLevel]: prev[scoreLevel] + 1 }));

    if (index < total - 1) {
      setIndex(index + 1);
      setPhase('idle');
      setMessages([]);
      setUserAnswer('');
      setUserAnswer2('');
      setTextInput('');
    } else {
      setPhase('complete');
    }
  }, [index, total, scoreLevel]);

  const skipTimer = useCallback(() => {
    setTimerActive(false);
    enterSpeakPhase(1);
  }, [enterSpeakPhase]);

  // キーボード操作
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSettings) return;
      // テキスト入力中はスペースバーを無視
      if ((phase === 'micReady1' || phase === 'micReady2') && inputMode === 'text') return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        switch (phase) {
          case 'idle': handleStart(); break;
          case 'think': skipTimer(); break;
          case 'speak1': case 'speak2': stopRecording(); break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, inputMode, showSettings, handleStart, skipTimer, stopRecording]);

  // 完了画面
  if (phase === 'complete' || index >= total) {
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
    <div className="min-h-screen bg-bg-page flex flex-col" style={{ height: '100dvh' }}>
      {/* ヘッダー */}
      <header className="bg-bg-card border-b border-border px-4 py-3 shrink-0">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/practice" className="text-text-muted hover:text-text-dark transition-colors">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <span className="text-sm font-medium text-text-dark">{index + 1} / {total}</span>
          <button onClick={() => setShowSettings(true)} className="text-text-light hover:text-text-muted transition-colors">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
        </div>
      </header>

      {/* プログレスバー */}
      <div className="h-1 bg-border shrink-0">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* スティッキー状況パネル */}
      <div className="bg-bg-card border-b border-border px-4 py-2 shrink-0">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-bold text-primary">{chunkTitle}</p>
          {pattern.situation && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{pattern.situation}</p>
          )}
        </div>
      </div>

      {/* チャットエリア */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`animate-msg-in flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 cursor-pointer transition-all ${
                  msg.speaker === 'opponent'
                    ? 'bg-bg-card border border-border shadow-sm rounded-bl-md'
                    : msg.speaker === 'system'
                    ? 'bg-success/10 border border-success/20 rounded-bl-md'
                    : msg.scoreLevel
                    ? `${LEVEL_CONFIG[msg.scoreLevel].bg} border ${
                        msg.scoreLevel === 'perfect' || msg.scoreLevel === 'great' ? 'border-success/30' :
                        msg.scoreLevel === 'good' ? 'border-blue-200' :
                        msg.scoreLevel === 'almost' ? 'border-amber-200' : 'border-error/30'
                      } rounded-br-md`
                    : 'bg-primary/10 border border-primary/20 rounded-br-md'
                }`}
                onClick={() => setShowJpId(showJpId === msg.id ? null : msg.id)}
              >
                {msg.isModelAnswer && (
                  <p className="text-[10px] font-semibold text-success mb-0.5">Model Answer</p>
                )}
                <p className={`text-sm leading-relaxed ${
                  msg.speaker === 'user' ? 'text-text-dark' :
                  msg.isModelAnswer ? 'text-success font-medium' : 'text-text-dark'
                }`}>
                  {msg.text}
                </p>
                {/* 日本語訳（タップで表示） */}
                {showJpId === msg.id && msg.textJp && (
                  <p className="text-xs text-text-muted mt-1.5 pt-1.5 border-t border-border/50">{msg.textJp}</p>
                )}
              </div>
            </div>
          ))}

          {/* タイピングインジケーター */}
          {phase === 'listen1' && messages.length === 0 && (
            <div className="flex justify-start animate-msg-in">
              <div className="bg-bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-text-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-text-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-text-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </main>

      {/* アクションエリア（下部固定） */}
      <div className="bg-bg-card border-t border-border px-4 py-4 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 16px)' }}>
        <div className="max-w-lg mx-auto">

          {/* idle: START ボタン */}
          {phase === 'idle' && (
            <button
              onClick={handleStart}
              className="w-full py-4 bg-cta text-white rounded-[var(--radius-button)] font-bold text-lg animate-cta-pulse hover:opacity-90 active:scale-[0.98] transition-all"
            >
              START
            </button>
          )}

          {/* listen1: 音声再生中 */}
          {phase === 'listen1' && (
            <div className="text-center py-2">
              <div className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-4 bg-primary rounded-full animate-pulse" />
                <span className="w-1.5 h-6 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-xs text-text-muted mt-2">音声再生中...</p>
            </div>
          )}

          {/* think: タイマー */}
          {phase === 'think' && (
            <div className="flex flex-col items-center py-2">
              <button onClick={skipTimer} className="relative w-20 h-20 mb-2">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="35" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle
                    cx="40" cy="40" r="35"
                    fill="none" stroke="var(--primary)" strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={220}
                    strokeDashoffset={220 * (1 - timer / thinkTime)}
                    transform="rotate(-90 40 40)"
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-primary">{timer}</span>
              </button>
              <p className="text-xs text-text-light">タップでスキップ</p>
            </div>
          )}

          {/* micReady1 / micReady2: 入力待ち */}
          {(phase === 'micReady1' || phase === 'micReady2') && (
            <>
              {inputMode === 'voice' ? (
                <button
                  onClick={() => startRecording(phase === 'micReady1' ? 1 : 2)}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-cta text-white rounded-[var(--radius-button)] font-medium animate-cta-pulse hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                  タップして話す
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    ref={textInputRef}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleTextSubmit(phase === 'micReady1' ? 1 : 2);
                      }
                    }}
                    placeholder="英語で入力..."
                    className="flex-1 px-4 py-3 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                  <button
                    onClick={() => handleTextSubmit(phase === 'micReady1' ? 1 : 2)}
                    disabled={!textInput.trim()}
                    className="px-5 py-3 bg-cta text-white rounded-[var(--radius-button)] text-sm font-medium disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    送信
                  </button>
                </div>
              )}
            </>
          )}

          {/* speak1 / speak2: 録音中 */}
          {(phase === 'speak1' || phase === 'speak2') && (
            <button
              onClick={stopRecording}
              className="w-full flex items-center justify-center gap-3 py-4 bg-error text-white rounded-[var(--radius-button)] font-medium animate-mic-pulse hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              録音中... タップで完了
            </button>
          )}

          {/* processing1 / processing2 / scoring1: 処理中 */}
          {(phase === 'processing1' || phase === 'processing2' || phase === 'scoring1') && (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-muted">
                {phase === 'scoring1' ? 'スコアリング中...' : '認識中...'}
              </p>
            </div>
          )}

          {/* check1: Re-record / OK */}
          {phase === 'check1' && (
            <div className="flex gap-3">
              <button
                onClick={handleReRecord}
                className="flex-1 py-3.5 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm font-medium text-text-muted hover:bg-border/30 active:scale-[0.98] transition-all"
              >
                再録音
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 py-3.5 bg-primary text-cta rounded-[var(--radius-button)] text-sm font-bold hover:bg-primary-dark active:scale-[0.98] transition-all"
              >
                OK
              </button>
            </div>
          )}

          {/* result1: Turn1結果 + 続行 */}
          {phase === 'result1' && (
            <div className="space-y-3">
              {/* スコアバッジ */}
              <div className="flex items-center justify-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold ${LEVEL_CONFIG[scoreLevel].bg} ${LEVEL_CONFIG[scoreLevel].color}`}>
                  {LEVEL_CONFIG[scoreLevel].emoji} {LEVEL_CONFIG[scoreLevel].label}
                </span>
                {chunkUsed && (
                  <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">Chunk Used</span>
                )}
              </div>

              {/* 続行ボタン */}
              <button
                onClick={handleResult1Continue}
                className="w-full py-3.5 bg-cta text-white rounded-[var(--radius-button)] text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {hasTurn2 ? 'Turn 2 へ' : '次のパターンへ'}
              </button>
            </div>
          )}

          {/* transition2 / listen2: Turn2遷移中 */}
          {(phase === 'transition2' || phase === 'listen2') && (
            <div className="text-center py-2">
              <p className="text-xs font-bold text-primary mb-1">Turn 2</p>
              <div className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-4 bg-primary rounded-full animate-pulse" />
                <span className="w-1.5 h-6 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* selfEval: 自己評価 */}
          {phase === 'selfEval' && (
            <div className="flex gap-2">
              <button
                onClick={() => handleSelfEval('good')}
                className="flex-1 py-3.5 border-2 border-success text-success rounded-[var(--radius-button)] text-sm font-bold hover:bg-success/10 active:scale-[0.98] transition-all"
              >
                できた
              </button>
              <button
                onClick={() => {
                  // Replay: Turn2の模範回答を再生
                  if (pattern?.followup_answer) {
                    addMessage({ speaker: 'system', text: pattern.followup_answer, textJp: pattern.followup_answer_jp || undefined, isModelAnswer: true });
                  }
                }}
                className="flex-1 py-3.5 border-2 border-primary text-primary rounded-[var(--radius-button)] text-sm font-bold hover:bg-primary/10 active:scale-[0.98] transition-all"
              >
                Replay
              </button>
              <button
                onClick={() => handleSelfEval('couldnt')}
                className="flex-1 py-3.5 border-2 border-error text-error rounded-[var(--radius-button)] text-sm font-bold hover:bg-error/10 active:scale-[0.98] transition-all"
              >
                できなかった
              </button>
            </div>
          )}
        </div>
      </div>

      {/* フェーズインジケーター */}
      {uiPhase && (
        <div className="bg-bg-card border-t border-border px-4 py-2 shrink-0">
          <div className="max-w-lg mx-auto flex justify-center gap-5 text-[11px]">
            {(['listen', 'think', 'speak', 'check', 'continue'] as UiPhase[]).map((s) => {
              const labels: Record<UiPhase, string> = {
                listen: '聞く', think: '考える', speak: '話す', check: '確認', continue: '続き',
              };
              const order: UiPhase[] = ['listen', 'think', 'speak', 'check', 'continue'];
              const currentIdx = uiPhase ? order.indexOf(uiPhase) : -1;
              const thisIdx = order.indexOf(s);
              const isActive = s === uiPhase;
              const isDone = thisIdx < currentIdx;

              return (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                    isActive ? 'bg-primary scale-125' : isDone ? 'bg-success' : 'bg-border'
                  }`} />
                  <span className={`transition-colors ${
                    isActive ? 'text-primary font-medium' : isDone ? 'text-success' : 'text-text-light'
                  }`}>{labels[s]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings Overlay */}
      {showSettings && (
        <SettingsOverlay
          thinkTime={thinkTime}
          speakTime={speakTime}
          inputMode={inputMode}
          turn2Mode={turn2Mode}
          onThinkTimeChange={setThinkTime}
          onSpeakTimeChange={setSpeakTime}
          onInputModeChange={setInputMode}
          onTurn2ModeChange={setTurn2Mode}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
