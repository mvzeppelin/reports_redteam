import { useEffect, useState } from 'react';

interface TimerProps {
  targetDate: Date;
  onExpire?: () => void;
  urgentThreshold?: number;
}

export function useCountdown(targetDate: Date, onExpire?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000)));
  }, [targetDate]);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  return secondsLeft;
}

export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function Timer({ targetDate, onExpire, urgentThreshold = 60 }: TimerProps) {
  const secondsLeft = useCountdown(targetDate, onExpire);
  const isUrgent = secondsLeft <= urgentThreshold && secondsLeft > 0;

  if (secondsLeft === 0) return null;

  return (
    <div className={`timer-block ${isUrgent ? 'timer-block--urgent' : ''}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>Código válido por</span>
      <span className="timer-value">{formatSeconds(secondsLeft)}</span>
    </div>
  );
}
