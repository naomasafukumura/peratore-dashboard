'use client';

import { useRef, useState, useCallback } from 'react';

interface AudioButtonProps {
  patternId: number;
  audioType: 'fpp_intro' | 'fpp_question' | 'spp';
  hasAudio: boolean;
  autoPlay?: boolean;
  onEnded?: () => void;
  label?: string;
  className?: string;
}

export default function AudioButton({
  patternId,
  audioType,
  hasAudio,
  autoPlay = false,
  onEnded,
  label,
  className = '',
}: AudioButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback(async () => {
    if (!hasAudio) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(`/api/audio/${patternId}?type=${audioType}`);
      audioRef.current.onended = () => {
        setIsPlaying(false);
        onEnded?.();
      };
    }

    try {
      setIsPlaying(true);
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch {
      setIsPlaying(false);
    }
  }, [hasAudio, patternId, audioType, onEnded]);

  // autoPlay: 初回レンダー時に再生
  const autoPlayRef = useRef(false);
  if (autoPlay && hasAudio && !autoPlayRef.current) {
    autoPlayRef.current = true;
    // useEffectの代わりにsetTimeoutで遅延再生（ブラウザ制限回避）
    setTimeout(() => play(), 100);
  }

  if (!hasAudio) {
    return null;
  }

  return (
    <button
      onClick={play}
      disabled={isPlaying}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
        ${isPlaying
          ? 'bg-blue-600 text-white scale-95'
          : 'bg-zinc-700 text-white hover:bg-zinc-600 active:scale-95'
        } ${className}`}
    >
      {isPlaying ? (
        <span className="animate-pulse">♪</span>
      ) : (
        <span>▶</span>
      )}
      {label && <span>{label}</span>}
    </button>
  );
}
