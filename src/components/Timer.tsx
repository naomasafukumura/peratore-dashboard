'use client';

import { useState, useEffect, useCallback } from 'react';

interface TimerProps {
  duration: number; // seconds
  onComplete: () => void;
  isRunning: boolean;
}

export default function Timer({ duration, onComplete, isRunning }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (!isRunning) return;

    if (timeLeft <= 0) {
      onComplete();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, timeLeft, onComplete]);

  const percentage = (timeLeft / duration) * 100;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentage / 100);

  if (!isRunning) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth="6"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke="#3b82f6" strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
          className="transition-all duration-1000 ease-linear"
        />
        <text x="50" y="55" textAnchor="middle" className="fill-white text-2xl font-bold">
          {timeLeft}
        </text>
      </svg>
      <p className="text-sm text-zinc-400">考えてみよう</p>
    </div>
  );
}
