import { useEffect, useRef, useState } from 'react';

/** Milliseconds left until `iso` (never below 0). Updates every second. Calls onExpire once at 0. */
export function useCountdown(iso: string | null | undefined, onExpire?: () => void): number {
  const target = iso ? new Date(iso).getTime() : null;
  const [left, setLeft] = useState(() => (target === null ? 0 : Math.max(target - Date.now(), 0)));
  const fired = useRef(false);
  const callback = useRef(onExpire);
  callback.current = onExpire;

  useEffect(() => {
    fired.current = false;
    if (target === null) {
      setLeft(0);
      return;
    }
    const tick = () => {
      const ms = Math.max(target - Date.now(), 0);
      setLeft(ms);
      if (ms === 0 && !fired.current) {
        fired.current = true;
        callback.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return left;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
