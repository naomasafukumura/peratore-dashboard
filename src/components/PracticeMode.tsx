'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { scoreTurn1Local, type ScoreLevel } from '@/lib/scoring';

/* ================================================================
   PracticeMode - Faithful port of practice-v2.html into React
   ================================================================ */

interface Pattern {
  id: number;
  situation: string | null;
  fpp_intro: string | null;
  fpp_question: string;   // = trigger in v2
  spp: string;             // = conclusion in v2
  spp_jp: string | null;
  followup_question: string | null;  // = followup
  followup_answer: string | null;    // = conclusion2Examples[0]
  followup_answer_jp: string | null;
  has_fpp_intro_audio: boolean;
  has_fpp_question_audio: boolean;
  has_spp_audio: boolean;
  has_followup_audio: boolean;
  has_natural_audio: boolean;
}

interface Props {
  patterns: Pattern[];
  chunkTitle: string;
  chunkTitleJp: string;
  backHref?: string;
  isHomework?: boolean;
}

type Phase =
  | 'idle'
  | 'listen1'
  | 'micReady1'
  | 'speak1'
  | 'processing1'
  | 'result1'
  | 'continueFlow'
  | 'listen2'
  | 'micReady2'
  | 'speak2'
  | 'processing2'
  | 'result2'
  | 'fullReplay'
  | 'complete';

type UiPhase = 'listen' | 'think' | 'speak' | 'check' | 'continue';

interface ChatBubble {
  id: string;
  type: 'opponent' | 'user' | 'typing';
  text: string;
  textJp?: string;
  resultClass?: string;  // result-perfect | result-almost | result-retry
  showEq?: boolean;
  audioType?: string;
  patternId?: number;
}

interface ReplayLine {
  speaker: 'opponent' | 'user';
  text: string;
  ja: string;
  audioType: string;
  patternId: number;
  hasAudio: boolean;
}

interface Stats {
  perfect: number;
  great: number;
  good: number;
  almost: number;
  retry: number;
}

const SCORE_LABELS: Record<string, string> = {
  perfect: 'Perfect!', great: 'Great!', good: 'Good!', almost: 'Almost!', retry: 'Try again!'
};

const REACTIONS: Record<string, string[]> = {
  perfect: ['Perfect!!', 'Awesome!!', 'Amazing!', 'Nailed it!'],
  great: ['Great!!', 'Nice one!', 'Sounds good!', 'Love it!'],
  good: ['Good!', 'Not bad!', 'Getting there!'],
  almost: ['Almost!', 'Close!', 'Keep going!'],
  retry: ['One more time!', 'Try again!', "Let's try again!"],
};

// ---- Utility: LCS diff highlighting ----
function highlightDiff(userText: string, naturalText: string): { userHtml: string; naturalHtml: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!userText) return { userHtml: '<span style="color:var(--text-muted)">-</span>', naturalHtml: esc(naturalText) };

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z']/g, '');
  const userWords = userText.split(/\s+/);
  const natWords = naturalText.split(/\s+/);
  const uNorm = userWords.map(norm);
  const nNorm = natWords.map(norm);

  const m = uNorm.length, n = nNorm.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = uNorm[i - 1] === nNorm[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const matchedNat = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (uNorm[i - 1] === nNorm[j - 1]) { matchedNat.add(j - 1); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }

  const natHtml = natWords.map((w, idx) => {
    if (!matchedNat.has(idx)) return '<span class="diff-highlight">' + esc(w) + '</span>';
    return esc(w);
  }).join(' ');

  return { userHtml: esc(userText), naturalHtml: natHtml };
}

// ---- Confetti ----
function spawnConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  const colors = ['#1a5a4a', '#3a8a5c', '#8b7032', '#5a7bc4', '#c45b8e', '#e8a838'];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.8 + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    c.style.width = (5 + Math.random() * 6) + 'px';
    c.style.height = (5 + Math.random() * 6) + 'px';
    container.appendChild(c);
  }
  setTimeout(() => container.remove(), 4000);
}

// ---- Reaction popup ----
function showReactionPopup(text: string) {
  const el = document.createElement('div');
  el.className = 'reaction-popup';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ===== Main Component =====
export default function PracticeMode({ patterns, chunkTitle, chunkTitleJp, backHref, isHomework }: Props) {
  // 会話モードは patterns[1] を練習ターゲットにするため index=1 で開始
  const [index, setIndex] = useState(patterns.length > 1 ? 1 : 0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Settings (localStorage persisted)
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [speakLimitSec, setSpeakLimitSec] = useState(7);
  const [turn2Mode, setTurn2Mode] = useState<'listen' | 'speak'>('listen');

  // Recording state
  const [speakTimer, setSpeakTimer] = useState(7);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speakTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Text input
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  // Turn 1 results
  const [userAnswer1, setUserAnswer1] = useState('');
  const [scoreLevel, setScoreLevel] = useState<ScoreLevel>('good');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // Turn 2 results
  const [userAnswer2, setUserAnswer2] = useState('');

  // Review overlay
  const [showReview, setShowReview] = useState(false);
  const [reviewTurn, setReviewTurn] = useState<1 | 2>(1);
  const [reviewShowQJa, setReviewShowQJa] = useState(false);
  const [reviewShowNatJa, setReviewShowNatJa] = useState(false);
  const [reviewShowFeedback, setReviewShowFeedback] = useState(false);
  const [reviewFeedbackText, setReviewFeedbackText] = useState('');
  const [reviewFeedbackLoading, setReviewFeedbackLoading] = useState(false);

  // Full replay
  const [replayLines, setReplayLines] = useState<ReplayLine[]>([]);
  const [replayPlayingIdx, setReplayPlayingIdx] = useState(-1);
  const [replayBubbleHints, setReplayBubbleHints] = useState<Record<number, boolean>>({});
  const [showPostReplayBar, setShowPostReplayBar] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats>({ perfect: 0, great: 0, good: 0, almost: 0, retry: 0 });
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // 宿題モード: 最終結果画面用の累積stats
  const [finalStats, setFinalStats] = useState<Stats | null>(null);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement>(null);

  // 会話モード: patterns[1] だけ練習し、patterns[0] をコンテキストとして表示
  const isConvMode = patterns.length > 1;
  const pattern = patterns[index];
  // 会話モードは1チャンク=1練習として total=1 で管理
  const total = isConvMode ? 1 : patterns.length;
  const displayNum = 1;
  const displayTotal = isConvMode ? 1 : patterns.length;
  const progress = isConvMode
    ? (phase === 'idle' ? 0 : 50)
    : total > 0 ? ((index + (phase === 'idle' ? 0 : 0.5)) / total) * 100 : 0;
  const hasTurn2 = !!(pattern?.followup_question);

  // UI phase mapping
  const uiPhase: UiPhase | null = (() => {
    switch (phase) {
      case 'listen1': return 'listen';
      case 'micReady1': case 'speak1': case 'processing1': return 'speak';
      case 'result1': return 'check';
      case 'continueFlow': case 'listen2': case 'micReady2': case 'speak2':
      case 'processing2': case 'result2': case 'fullReplay': return 'continue';
      default: return null;
    }
  })();

  // ---- localStorage ----
  useEffect(() => {
    const im = localStorage.getItem('pp-inputMode');
    if (im === 'voice' || im === 'text') setInputMode(im);
    const sl = localStorage.getItem('pp-speakLimit');
    if (sl) { const n = parseInt(sl); if (n >= 5 && n <= 20) setSpeakLimitSec(n); }
    const t2 = localStorage.getItem('pp-turn2Mode');
    if (t2 === 'listen' || t2 === 'speak') setTurn2Mode(t2);
  }, []);

  useEffect(() => { localStorage.setItem('pp-inputMode', inputMode); }, [inputMode]);
  useEffect(() => { localStorage.setItem('pp-speakLimit', String(speakLimitSec)); }, [speakLimitSec]);
  useEffect(() => { localStorage.setItem('pp-turn2Mode', turn2Mode); }, [turn2Mode]);

  // ---- Auto-scroll chat ----
  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
    }
  }, [bubbles, phase]);

  // ---- Audio helpers ----
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const playAudio = useCallback((patternId: number, type: string): Promise<void> => {
    stopAudio();
    return new Promise<void>((resolve) => {
      const audio = new Audio(`/api/audio/${patternId}?type=${type}`);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, [stopAudio]);

  const playAudioUrl = useCallback((url: string): Promise<void> => {
    stopAudio();
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, [stopAudio]);

  // ---- Bubble helpers ----
  const addBubble = useCallback((bubble: Omit<ChatBubble, 'id'>) => {
    setBubbles(prev => [...prev, { ...bubble, id: `b-${Date.now()}-${Math.random()}` }]);
  }, []);

  const removeBubblesByType = useCallback((type: string) => {
    setBubbles(prev => prev.filter(b => b.type !== type));
  }, []);

  // ===== Turn 1 Flow =====

  const handleStart = useCallback(async () => {
    if (!pattern) return;
    setBubbles([]);
    setUserAnswer1('');
    setUserAnswer2('');
    setAiFeedback(null);
    setShowReview(false);
    setShowPostReplayBar(false);

    setPhase('listen1');

    // 会話モード: patterns[index-1] をコンテキストとして先に表示
    if (patterns.length > 1 && index > 0) {
      const ctx = patterns[index - 1];
      addBubble({ type: 'typing', text: '' });
      await new Promise(r => setTimeout(r, 400));
      setBubbles(prev => prev.filter(b => b.type !== 'typing'));
      addBubble({ type: 'opponent', text: ctx.fpp_question, showEq: ctx.has_fpp_question_audio, audioType: 'fpp_question', patternId: ctx.id });
      if (ctx.has_fpp_question_audio) await playAudio(ctx.id, 'fpp_question');
      await new Promise(r => setTimeout(r, 300));
      addBubble({ type: 'user', text: ctx.spp });
      if (ctx.has_spp_audio) await playAudio(ctx.id, 'spp');
      await new Promise(r => setTimeout(r, 400));
    }

    // Show typing indicator
    addBubble({ type: 'typing', text: '' });

    // Play intro audio if exists
    if (pattern.fpp_intro && pattern.has_fpp_intro_audio) {
      await playAudio(pattern.id, 'fpp_intro');
    }

    // Small delay for typing indicator
    await new Promise(r => setTimeout(r, 600));

    // Remove typing, add opponent bubble
    setBubbles(prev => prev.filter(b => b.type !== 'typing'));
    addBubble({
      type: 'opponent',
      text: pattern.fpp_question,
      textJp: pattern.situation || undefined,
      showEq: pattern.has_fpp_question_audio,
      audioType: 'fpp_question',
      patternId: pattern.id,
    });

    // Play question audio
    if (pattern.has_fpp_question_audio) {
      await playAudio(pattern.id, 'fpp_question');
    }

    // Go to micReady
    if (inputMode === 'text') {
      setPhase('micReady1');
      setTimeout(() => textInputRef.current?.focus(), 100);
    } else {
      setPhase('micReady1');
    }
  }, [pattern, patterns, addBubble, playAudio, inputMode]);

  // ---- Recording ----
  const clearSpeakTimers = useCallback(() => {
    if (speakTimerIntervalRef.current) { clearInterval(speakTimerIntervalRef.current); speakTimerIntervalRef.current = null; }
    if (speakTimeoutRef.current) { clearTimeout(speakTimeoutRef.current); speakTimeoutRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  const stopRecording = useCallback(() => {
    clearSpeakTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, [clearSpeakTimers]);

  const processRecording = useCallback(async (blob: Blob, turn: 1 | 2) => {
    setPhase(turn === 1 ? 'processing1' : 'processing2');

    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      const text = data.text || '';

      if (turn === 1) {
        setUserAnswer1(text || '(No speech detected)');
        addBubble({ type: 'user', text: text || '(No speech detected)' });
      } else {
        setUserAnswer2(text || '(No speech detected)');
        addBubble({ type: 'user', text: text || '(No speech detected)' });
      }
    } catch {
      if (turn === 1) {
        setUserAnswer1('(Recognition error)');
        addBubble({ type: 'user', text: '(Recognition error)' });
      } else {
        setUserAnswer2('(Recognition error)');
        addBubble({ type: 'user', text: '(Recognition error)' });
      }
    }

    // mediaRecorderRef を null にして useEffect でスコアリングを起動する
    // (processRecording 内で scoreTurn1() を直接呼ぶと stale closure で userAnswer1='') になる)
    mediaRecorderRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addBubble]);

  const startRecording = useCallback(async (turn: 1 | 2) => {
    setPhase(turn === 1 ? 'speak1' : 'speak2');
    setSpeakTimer(speakLimitSec);

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
        clearSpeakTimers();
        const blobData = new Blob(chunksRef.current, { type: mimeType });
        processRecording(blobData, turn);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      // Silence detection via Web Audio API
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silentFrames = 0;
        const SILENCE_THRESHOLD = 10;
        const SILENCE_FRAMES_LIMIT = 30; // ~1.5s of silence at 50ms interval

        const checkSilence = () => {
          if (!analyserRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          if (avg < SILENCE_THRESHOLD) {
            silentFrames++;
            if (silentFrames >= SILENCE_FRAMES_LIMIT && chunksRef.current.length > 0) {
              stopRecording();
              return;
            }
          } else {
            silentFrames = 0;
          }
          silenceTimerRef.current = setTimeout(checkSilence, 50);
        };
        silenceTimerRef.current = setTimeout(checkSilence, 1000); // start after 1s
      } catch {
        // Silence detection not available, rely on timer only
      }

      // Countdown timer
      speakTimerIntervalRef.current = setInterval(() => {
        setSpeakTimer(prev => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Hard timeout
      speakTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, speakLimitSec * 1000);
    } catch {
      // Mic access denied → fallback to text
      setInputMode('text');
      setPhase(turn === 1 ? 'micReady1' : 'micReady2');
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  }, [speakLimitSec, clearSpeakTimers, processRecording, stopRecording]);

  // ---- Text submit ----
  const handleTextSubmit = useCallback(async (turn: 1 | 2) => {
    const answer = textInput.trim();
    if (!answer) return;
    setTextInput('');

    if (turn === 1) {
      setUserAnswer1(answer);
      addBubble({ type: 'user', text: answer });
      setPhase('processing1');
      // Score immediately
    } else {
      setUserAnswer2(answer);
      addBubble({ type: 'user', text: answer });
      setPhase('processing2');
    }
  }, [textInput, addBubble]);

  // ---- Scoring Turn 1 ----
  // We define this as a ref-based function to avoid stale closure issues
  const scoreTurn1Ref = useRef<() => Promise<void>>(undefined);

  const scoreTurn1 = useCallback(async () => {
    if (!pattern) return;

    // Get userAnswer1 from the latest state
    const currentAnswer = userAnswer1;
    let level: ScoreLevel;

    try {
      const res = await fetch('/api/score-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAnswer: currentAnswer,
          question: pattern.fpp_question,
          targetChunk: chunkTitle,
          exampleAnswer: pattern.spp,
          turn: 1,
        }),
      });
      const data = await res.json();
      if (data.fallback || !data.level) {
        const local = scoreTurn1Local(currentAnswer, pattern.spp, chunkTitle);
        level = local.level;
      } else {
        level = data.level as ScoreLevel;
      }
    } catch {
      const local = scoreTurn1Local(currentAnswer, pattern.spp, chunkTitle);
      level = local.level;
    }

    setScoreLevel(level);

    // Show reaction
    const texts = REACTIONS[level] || REACTIONS.good;
    showReactionPopup(texts[Math.floor(Math.random() * texts.length)]);
    if (level === 'perfect' || level === 'great') {
      spawnConfetti();
    }

    // Show review overlay
    setReviewTurn(1);
    setReviewShowQJa(false);
    setReviewShowNatJa(false);
    setReviewShowFeedback(false);
    setReviewFeedbackText('');
    setAiFeedback(null);
    setShowReview(true);
    setPhase('result1');
  }, [pattern, userAnswer1, chunkTitle]);

  scoreTurn1Ref.current = scoreTurn1;

  // Turn 1 スコアリング: テキスト入力 & 音声入力の両方をカバー
  // processRecording が mediaRecorderRef.current = null してから呼ばれる
  useEffect(() => {
    if (phase === 'processing1' && userAnswer1 && !mediaRecorderRef.current?.state) {
      scoreTurn1Ref.current?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userAnswer1]);

  // ---- Review overlay: fetch AI feedback ----
  const fetchFeedback = useCallback(async () => {
    if (!pattern) return;
    setReviewFeedbackLoading(true);
    setReviewShowFeedback(true);
    try {
      const userReply = reviewTurn === 1 ? userAnswer1 : userAnswer2;
      const naturalReply = reviewTurn === 1 ? pattern.spp : (pattern.followup_answer || '');
      const question = reviewTurn === 1 ? pattern.fpp_question : (pattern.followup_question || '');
      const res = await fetch('/api/explain-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAnswer: userReply, question, exampleAnswer: naturalReply }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewFeedbackText(data.feedback || '');
      }
    } catch {
      setReviewFeedbackText('');
    }
    setReviewFeedbackLoading(false);
  }, [pattern, reviewTurn, userAnswer1, userAnswer2]);

  // ---- Review Re-record (Turn 1) ----
  const handleReviewRerecord = useCallback(() => {
    setShowReview(false);
    // Remove last user bubble
    setBubbles(prev => {
      const idx = [...prev].reverse().findIndex(b => b.type === 'user');
      if (idx === -1) return prev;
      const removeIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== removeIdx);
    });
    setUserAnswer1('');
    if (inputMode === 'text') {
      setPhase('micReady1');
      setTimeout(() => textInputRef.current?.focus(), 100);
    } else {
      setPhase('micReady1');
    }
  }, [inputMode]);

  // ===== Turn 2 Flow =====
  const startTurn2 = useCallback(async () => {
    if (!pattern?.followup_question) return;

    // Show typing
    addBubble({ type: 'typing', text: '' });
    await new Promise(r => setTimeout(r, 600));

    // Remove typing, add followup question
    setBubbles(prev => prev.filter(b => b.type !== 'typing'));
    addBubble({
      type: 'opponent',
      text: pattern.followup_question,
      showEq: pattern.has_followup_audio,
      audioType: 'followup_question',
      patternId: pattern.id,
    });

    setPhase('listen2');

    // Play followup audio
    if (pattern.has_followup_audio) {
      await playAudio(pattern.id, 'followup_question');
    }

    if (turn2Mode === 'listen') {
      // Listen-only mode: show model answer and proceed
      if (pattern.followup_answer) {
        addBubble({
          type: 'opponent',
          text: pattern.followup_answer,
          textJp: pattern.followup_answer_jp || undefined,
        });
      }
      await new Promise(r => setTimeout(r, 1500));
      goToFullReplay();
    } else {
      // Speak mode
      if (inputMode === 'text') {
        setPhase('micReady2');
        setTimeout(() => textInputRef.current?.focus(), 100);
      } else {
        setPhase('micReady2');
      }
    }
  }, [pattern, addBubble, playAudio, turn2Mode, inputMode]);

  // ---- Turn 2 review ----
  const showTurn2Review = useCallback(async () => {
    if (!pattern) return;
    setReviewTurn(2);
    setReviewShowQJa(false);
    setReviewShowNatJa(false);
    setReviewShowFeedback(false);
    setReviewFeedbackText('');

    // No API scoring for Turn 2, just show review
    setShowReview(true);
    setPhase('result2');
  }, [pattern]);

  // Handle text submit for turn 2
  useEffect(() => {
    if (phase === 'processing2' && userAnswer2 && !mediaRecorderRef.current?.state) {
      showTurn2Review();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userAnswer2]);

  // ---- Turn 2 self-eval buttons ----
  const handleT2Eval = useCallback((eval_: 'good' | 'couldnt') => {
    setShowReview(false);
    if (index < total - 1) {
      setIndex(index + 1);
      setPhase('idle');
      setBubbles([]);
      setUserAnswer1('');
      setUserAnswer2('');
      setReplayLines([]);
    } else {
      goToFullReplay();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  const handleT2Replay = useCallback(() => {
    // Play the followup answer audio in the review
    if (pattern?.id) {
      playAudio(pattern.id, 'spp'); // Play the model answer
    }
  }, [pattern, playAudio]);

  // ===== Full Replay (全パターン) =====
  const goToFullReplay = useCallback(() => {
    setShowReview(false);
    setPhase('fullReplay');

    // 全パターンの FPP/SPP/FQ/FA を順番に並べてリプレイ
    const lines: ReplayLine[] = [];
    for (const p of patterns) {
      lines.push({
        speaker: 'opponent',
        text: p.fpp_question,
        ja: p.situation || '',
        audioType: 'fpp_question',
        patternId: p.id,
        hasAudio: p.has_fpp_question_audio,
      });
      lines.push({
        speaker: 'user',
        text: p.spp,
        ja: p.spp_jp || '',
        audioType: 'spp',
        patternId: p.id,
        hasAudio: p.has_spp_audio,
      });
      if (p.followup_question && p.followup_answer) {
        lines.push({
          speaker: 'opponent',
          text: p.followup_question,
          ja: '',
          audioType: 'followup_question',
          patternId: p.id,
          hasAudio: p.has_followup_audio,
        });
        lines.push({
          speaker: 'user',
          text: p.followup_answer,
          ja: p.followup_answer_jp || '',
          audioType: 'natural',
          patternId: p.id,
          hasAudio: p.has_natural_audio,
        });
      }
    }

    setReplayLines(lines);
    setReplayBubbleHints({});
    setReplayPlayingIdx(-1);

    // Auto-play sequentially
    playReplaySequence(lines);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patterns]);

  // ---- Review OK (Turn 1): proceed to Turn 2 or next pattern / full replay ----
  const handleReviewOk = useCallback(async () => {
    setShowReview(false);
    if (hasTurn2) {
      // Start Turn 2
      setPhase('continueFlow');
      await new Promise(r => setTimeout(r, 400));
      await startTurn2();
    } else if (isConvMode && index < total - 1) {
      // 会話モード: まだペアが残っている → フルリプレイをスキップして次ペアへ直進
      setStats(prev => ({ ...prev, [scoreLevel]: prev[scoreLevel] + 1 }));
      setIndex(index + 1);
      setPhase('idle');
      setBubbles([]);
      setUserAnswer1('');
      setUserAnswer2('');
      setReplayLines([]);
    } else {
      // 最後のペア or 通常モード: フルリプレイへ
      goToFullReplay();
    }
  }, [hasTurn2, startTurn2, goToFullReplay, isConvMode, index, total, scoreLevel]);

  const playReplaySequence = useCallback(async (lines: ReplayLine[]) => {
    for (let i = 0; i < lines.length; i++) {
      setReplayPlayingIdx(i);
      if (lines[i].hasAudio) {
        await playAudio(lines[i].patternId, lines[i].audioType);
      } else {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
    setReplayPlayingIdx(-1);
    setShowPostReplayBar(true);
  }, [playAudio]);

  // Post-replay handlers
  const handleReplayAgain = useCallback(() => {
    setShowPostReplayBar(false);
    playReplaySequence(replayLines);
  }, [replayLines, playReplaySequence]);

  const handleReplayRetry = useCallback(() => {
    // Re-do this pattern
    setShowPostReplayBar(false);
    setPhase('idle');
    setBubbles([]);
    setUserAnswer1('');
    setUserAnswer2('');
    setReplayLines([]);
  }, []);

  const handleReplayNext = useCallback(() => {
    setShowPostReplayBar(false);
    // Update stats
    setStats(prev => ({ ...prev, [scoreLevel]: prev[scoreLevel] + 1 }));

    if (index < total - 1) {
      setIndex(index + 1);
      setPhase('idle');
      setBubbles([]);
      setUserAnswer1('');
      setUserAnswer2('');
      setReplayLines([]);
    } else {
      setPhase('complete');
    }
  }, [index, total, scoreLevel]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSettings || showReview) return;
      if ((phase === 'micReady1' || phase === 'micReady2') && inputMode === 'text') return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        switch (phase) {
          case 'idle': handleStart(); break;
          case 'speak1': case 'speak2': stopRecording(); break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, inputMode, showSettings, showReview, handleStart, stopRecording]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      stopAudio();
      clearSpeakTimers();
    };
  }, [stopAudio, clearSpeakTimers]);

  // ===== 宿題モード: 完了時に次チャンクへ or 最終結果表示 =====
  useEffect(() => {
    if (phase !== 'complete' || !isHomework) return;
    const currentStats = statsRef.current;
    const prevRaw = sessionStorage.getItem('hwAccStats');
    const prev: Stats = prevRaw ? JSON.parse(prevRaw) : { perfect: 0, great: 0, good: 0, almost: 0, retry: 0 };
    const acc: Stats = {
      perfect: prev.perfect + currentStats.perfect,
      great: prev.great + currentStats.great,
      good: prev.good + currentStats.good,
      almost: prev.almost + currentStats.almost,
      retry: prev.retry + currentStats.retry,
    };
    const queueRaw = sessionStorage.getItem('hwChunkQueue');
    const queue = queueRaw ? JSON.parse(queueRaw) : null;
    const hasMore = queue && Array.isArray(queue.ids) && queue.ids.length > 0;
    if (hasMore) {
      sessionStorage.setItem('hwAccStats', JSON.stringify(acc));
      const nextId = queue.ids.shift();
      sessionStorage.setItem('hwChunkQueue', JSON.stringify(queue));
      const studentParam = queue.student ? `&student=${encodeURIComponent(queue.student)}` : '';
      window.location.href = `/practice/pattern/${nextId}?homework=1${studentParam}`;
    } else {
      sessionStorage.removeItem('hwChunkQueue');
      sessionStorage.removeItem('hwAccStats');
      setFinalStats(acc);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ===== Completion Screen =====
  if (phase === 'complete') {
    // 宿題モード: finalStats が確定するまで待機（useEffectが処理中）
    if (isHomework && !finalStats) return null;
    const displayStats = finalStats ?? stats;
    const totalDone = displayStats.perfect + displayStats.great + displayStats.good + displayStats.almost + displayStats.retry;
    return (
      <div className="complete show">
        <div className="complete-icon">&#127881;</div>
        <div className="complete-title">Well Done!</div>
        <div className="complete-subtitle">{totalDone} patterns completed</div>
        <div className="complete-stats">
          <div className="complete-stat">
            <div className="complete-stat-num g">{displayStats.perfect + displayStats.great}</div>
            <div className="complete-stat-label">Perfect/Great</div>
          </div>
          <div className="complete-stat">
            <div className="complete-stat-num a">{displayStats.good + displayStats.almost}</div>
            <div className="complete-stat-label">Good/Almost</div>
          </div>
          <div className="complete-stat">
            <div className="complete-stat-num r">{displayStats.retry}</div>
            <div className="complete-stat-label">Retry</div>
          </div>
        </div>
        <Link href={backHref ?? '/practice'} className="complete-btn" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
          Back to Menu
        </Link>
      </div>
    );
  }

  if (!pattern) return null;

  // ---- Diff for review ----
  const reviewUserReply = reviewTurn === 1 ? userAnswer1 : userAnswer2;
  const reviewNaturalReply = reviewTurn === 1 ? pattern.spp : (pattern.followup_answer || '');
  const reviewQuestionText = reviewTurn === 1 ? pattern.fpp_question : (pattern.followup_question || '');
  const reviewQuestionJa = reviewTurn === 1 ? (pattern.situation || '') : '';
  const reviewNaturalJa = reviewTurn === 1 ? (pattern.spp_jp || '') : (pattern.followup_answer_jp || '');
  const diff = highlightDiff(reviewUserReply, reviewNaturalReply);

  return (
    <>
      {/* ===== Practice Screen ===== */}
      <div className="prac">
        {/* Header */}
        <div className="p-hd">
          <Link href={backHref ?? '/practice'} className="p-ib" style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div className="p-hd-info">
            <div className="p-hd-t">Pattern Practice</div>
            <div className="p-hd-c">{displayNum} / {displayTotal}</div>
          </div>
          <button className="p-ib" onClick={() => setShowSettings(true)} aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="p-prog-bar">
          <div className="p-prog-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Situation panel */}
        <div className="mobile-situation-panel">
          <div className="mobile-situation-chunk">{chunkTitle}</div>
          {pattern.situation && <div className="mobile-situation-text">{pattern.situation}</div>}
        </div>

        {/* Phase indicator */}
        {uiPhase && (
          <div className="phase-indicator">
            {(['listen', 'think', 'speak', 'check', 'continue'] as UiPhase[]).map((step, si) => {
              const order: UiPhase[] = ['listen', 'think', 'speak', 'check', 'continue'];
              const labels: Record<UiPhase, string> = { listen: 'Listen', think: 'Think', speak: 'Speak', check: 'Check', continue: 'Continue' };
              const currentIdx = uiPhase ? order.indexOf(uiPhase) : -1;
              const thisIdx = order.indexOf(step);
              const isActive = step === uiPhase;
              const isDone = thisIdx < currentIdx;
              return (
                <span key={step} style={{ display: 'contents' }}>
                  {si > 0 && <div className="phase-sep" />}
                  <div className="phase-step">
                    <div className={`phase-dot ${isActive ? 'active' : isDone ? 'done' : ''}`} />
                    <div className={`phase-label ${isActive ? 'active' : isDone ? 'done' : ''}`}>{labels[step]}</div>
                  </div>
                </span>
              );
            })}
          </div>
        )}

        {/* Practice body */}
        <div className="prac-body">
          <div className="prac-right" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Chat thread */}
            {phase !== 'fullReplay' ? (
              <div className="chat-thread" ref={chatThreadRef}>
                {bubbles.map((b) => {
                  if (b.type === 'typing') {
                    return (
                      <div key={b.id} className="chat-typing">
                        <div className="chat-avatar">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                        <div className="typing-bubble">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                        </div>
                      </div>
                    );
                  }
                  if (b.type === 'opponent') {
                    return (
                      <div key={b.id} className="chat-opponent">
                        <div className="chat-avatar">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                        <div className="chat-bubble-left">
                          <div className="bubble-text">{b.text}</div>
                          {b.showEq && (
                            <div className="bubble-eq">
                              <div className="eq-bars">
                                <span /><span /><span /><span />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (b.type === 'user') {
                    return (
                      <div key={b.id} className="chat-user">
                        <div className={`chat-bubble-right ${b.resultClass || ''}`}>
                          <div className="bubble-text">{b.text}</div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ) : (
              /* Full replay view: 音声に合わせて1行ずつ表示 */
              <div className="chat-thread" ref={chatThreadRef}>
                {replayLines.slice(0, showPostReplayBar ? replayLines.length : replayPlayingIdx + 1).map((line, li) => {
                  if (line.speaker === 'opponent') {
                    return (
                      <div key={li}>
                        <div className="chat-opponent">
                          <div className="chat-avatar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          </div>
                          <div className="chat-bubble-left" style={{ cursor: 'pointer' }} onClick={() => setReplayBubbleHints(prev => ({ ...prev, [li]: !prev[li] }))}>
                            <div className="bubble-text">{line.text}</div>
                            {replayBubbleHints[li] && line.ja && (
                              <div className="bubble-hint">
                                <div className="bubble-hint-ja">{line.ja}</div>
                              </div>
                            )}
                          </div>
                          {line.hasAudio && (
                            <button
                              className="bubble-play-btn"
                              onClick={(e) => { e.stopPropagation(); playAudio(line.patternId, line.audioType); }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div key={li}>
                        <div className="chat-user">
                          <div className="chat-bubble-right" style={{ cursor: 'pointer' }} onClick={() => setReplayBubbleHints(prev => ({ ...prev, [li]: !prev[li] }))}>
                            <div className="bubble-text">{line.text}</div>
                            {replayBubbleHints[li] && line.ja && (
                              <div className="bubble-hint">
                                <div className="bubble-hint-ja">{line.ja}</div>
                              </div>
                            )}
                          </div>
                          {line.hasAudio && (
                            <button
                              className="bubble-play-btn"
                              onClick={(e) => { e.stopPropagation(); playAudio(line.patternId, line.audioType); }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )}

            {/* Bottom action area */}
            <div className="action-area">
              {/* idle: START */}
              {phase === 'idle' && (
                <div className="action-phase v">
                  <button className="action-start-btn" onClick={handleStart}>START</button>
                </div>
              )}

              {/* listen1: audio playing */}
              {phase === 'listen1' && (
                <div className="action-phase v">
                  <div className="action-speak">
                    <div className="speak-status" style={{ fontSize: '14px', color: 'var(--text-sub)' }}>Listening...</div>
                  </div>
                </div>
              )}

              {/* micReady1 / micReady2 */}
              {(phase === 'micReady1' || phase === 'micReady2') && (
                <div className="action-phase v">
                  {inputMode === 'voice' ? (
                    <div className="action-speak">
                      <div className="mic-ready-hint">Tap to answer</div>
                      <button className="mic-start-btn" onClick={() => startRecording(phase === 'micReady1' ? 1 : 2)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="text-input-area">
                      <input
                        ref={textInputRef}
                        type="text"
                        className="text-input-field"
                        placeholder="Type your answer..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleTextSubmit(phase === 'micReady1' ? 1 : 2);
                          }
                        }}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        autoFocus
                      />
                      <button
                        className="text-input-submit"
                        onClick={() => handleTextSubmit(phase === 'micReady1' ? 1 : 2)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* speak1 / speak2: recording */}
              {(phase === 'speak1' || phase === 'speak2') && (
                <div className="action-phase v">
                  <div className="action-speak">
                    <div className="mic-row">
                      <div className="mic-ring">
                        <div className="mic-ring-pulse" />
                        <div className="mic-ring-inner">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        </div>
                      </div>
                      <button className="done-btn" onClick={stopRecording}>I&apos;m done</button>
                    </div>
                    <div className="speak-timer">{speakTimer}</div>
                    <div className="speak-status">Listening...</div>
                  </div>
                </div>
              )}

              {/* processing1 / processing2 */}
              {(phase === 'processing1' || phase === 'processing2') && (
                <div className="action-phase v">
                  <div className="action-speak">
                    <div className="speak-status" style={{ fontSize: '14px', color: 'var(--text-sub)' }}>Processing...</div>
                  </div>
                </div>
              )}

              {/* result1 / result2: shown in overlay, action area minimal */}
              {(phase === 'result1' || phase === 'result2') && (
                <div className="action-phase v">
                  <div className="action-speak">
                    <div className="speak-status" style={{ fontSize: '14px', color: 'var(--text-sub)' }}>Review your answer</div>
                  </div>
                </div>
              )}

              {/* continueFlow / listen2 */}
              {(phase === 'continueFlow' || phase === 'listen2') && (
                <div className="action-phase v">
                  <div className="action-speak">
                    <div className="mic-ready-hint">Turn 2</div>
                    <div className="speak-status">Listening...</div>
                  </div>
                </div>
              )}

              {/* fullReplay: no action buttons, post-replay bar at bottom */}
              {phase === 'fullReplay' && !showPostReplayBar && (
                <div className="action-phase v">
                  <div className="action-speak">
                    <div className="speak-status" style={{ fontSize: '14px', color: 'var(--text-sub)' }}>Replaying conversation...</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Review Overlay ===== */}
      {showReview && (
        <div className={`review-overlay ${showReview ? 'show' : ''}`}>
          <div className="review-card">
            <div className="review-hd-row">
              <div className="review-turn-label">Turn {reviewTurn}</div>
              {reviewTurn === 1 && (
                <div className={`review-score-badge score-${scoreLevel}`}>
                  {SCORE_LABELS[scoreLevel]}
                </div>
              )}
            </div>

            {/* Question context */}
            <div className="review-question" onClick={() => setReviewShowQJa(!reviewShowQJa)}>
              <div className="review-q-text">{reviewQuestionText}</div>
              {reviewShowQJa && reviewQuestionJa && (
                <div className="review-q-ja">{reviewQuestionJa}</div>
              )}
            </div>

            {/* Your reply */}
            <div className="review-section">
              <div className="review-label">Your reply</div>
              <div
                className="review-text review-text-tappable"
                onClick={() => {
                  if (reviewShowFeedback) {
                    setReviewShowFeedback(false);
                  } else if (reviewFeedbackText) {
                    setReviewShowFeedback(true);
                  } else {
                    fetchFeedback();
                  }
                }}
                dangerouslySetInnerHTML={{ __html: diff.userHtml }}
              />
              {reviewShowFeedback && (
                <div className="review-feedback">
                  <div className="review-feedback-text">
                    {reviewFeedbackLoading ? (
                      <span className="review-feedback-loading">Loading...</span>
                    ) : (
                      reviewFeedbackText
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Natural reply (best answer) */}
            <div className="review-section">
              <div className="review-label natural">One natural reply</div>
              <div
                className="review-text review-text-tappable"
                onClick={() => setReviewShowNatJa(!reviewShowNatJa)}
                dangerouslySetInnerHTML={{ __html: diff.naturalHtml }}
              />
              {reviewShowNatJa && reviewNaturalJa && (
                <div className="review-ja">{reviewNaturalJa}</div>
              )}
            </div>
          </div>

          {/* Review buttons */}
          {reviewTurn === 1 ? (
            <div className="review-btns">
              <button className="review-btn review-good" onClick={handleReviewOk}>OK</button>
              <button className="review-btn review-rerecord" onClick={handleReviewRerecord}>Re-record</button>
            </div>
          ) : (
            <div className="review-btns">
              <button className="review-btn review-good" onClick={() => handleT2Eval('good')}>
                できた
              </button>
              <button className="review-btn review-play" onClick={handleT2Replay}>
                Replay
              </button>
              <button className="review-btn review-bad" onClick={() => handleT2Eval('couldnt')}>
                できなかった
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== Post-replay bar ===== */}
      {showPostReplayBar && (
        <div className="post-replay-bar show">
          <button className="post-replay-btn replay" onClick={handleReplayAgain}>再度再生</button>
          <button className="post-replay-btn retry" onClick={handleReplayRetry}>もう一回</button>
          <button className="post-replay-btn next" onClick={handleReplayNext}>次へ</button>
        </div>
      )}

      {/* ===== Settings Overlay ===== */}
      {showSettings && (
        <div className="settings-overlay show">
          <div className="settings-panel">
            <div className="settings-hd">
              <div className="settings-title">Settings</div>
              <button className="settings-close" onClick={() => setShowSettings(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="settings-section">
              <div className="settings-label">Input Mode</div>
              <div className="settings-toggle-group">
                <button
                  className={`settings-toggle ${inputMode === 'voice' ? 'active' : ''}`}
                  onClick={() => setInputMode('voice')}
                >
                  Voice
                </button>
                <button
                  className={`settings-toggle ${inputMode === 'text' ? 'active' : ''}`}
                  onClick={() => setInputMode('text')}
                >
                  Text
                </button>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-label">Speak Time</div>
              <div className="settings-slider-row">
                <input
                  type="range"
                  className="settings-slider"
                  min={5}
                  max={20}
                  value={speakLimitSec}
                  step={1}
                  onChange={(e) => setSpeakLimitSec(parseInt(e.target.value))}
                />
                <span className="settings-slider-val">{speakLimitSec}s</span>
              </div>
              <div className="settings-hint">Recording time limit after pressing mic</div>
            </div>
            <div className="settings-section">
              <div className="settings-label">Turn 2</div>
              <div className="settings-toggle-group">
                <button
                  className={`settings-toggle ${turn2Mode === 'listen' ? 'active' : ''}`}
                  onClick={() => setTurn2Mode('listen')}
                >
                  聞くだけ
                </button>
                <button
                  className={`settings-toggle ${turn2Mode === 'speak' ? 'active' : ''}`}
                  onClick={() => setTurn2Mode('speak')}
                >
                  自分も言う
                </button>
              </div>
              <div className="settings-hint">Turn 2を聞くだけにするか、自分でも回答するか</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
