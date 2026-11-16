import { Timer } from 'lucide-react';
import { formatClock, useCountdown } from '@/hooks/useCountdown';

interface HoldTimerProps {
  holdExpiresAt: string | null | undefined;
  onExpire: () => void;
}

const FULL_HOLD_MS = 10 * 60 * 1000;

/** "Your tickets are held for 09:41" with a bar that shrinks. Turns red in the last two minutes. */
export default function HoldTimer({ holdExpiresAt, onExpire }: HoldTimerProps) {
  const left = useCountdown(holdExpiresAt, onExpire);
  const urgent = left < 2 * 60 * 1000;
  const percent = Math.min(100, (left / FULL_HOLD_MS) * 100);

  return (
    <div role="timer" aria-live="off" className={`rounded-2xl p-3 ring-1 transition-colors ${urgent ? 'bg-red-50 ring-red-200' : 'bg-white/60 ring-wine-900/15'}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={`flex items-center gap-2 ${urgent ? 'font-semibold text-red-800' : 'text-wine-900/75'}`}>
          <Timer className={`h-4 w-4 ${urgent ? 'animate-pulse' : ''}`} aria-hidden="true" />
          Your tickets are held for you
        </span>
        <span className={`font-mono text-base font-semibold tabular-nums ${urgent ? 'text-red-700' : 'text-wine-900'}`}>{formatClock(left)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wine-900/10" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${urgent ? 'bg-red-600' : 'bg-crimson'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
