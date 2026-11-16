import { useEffect, useState } from 'react';
import { fetchPaymentConfig } from '@/lib/paymentApi';

let cached: Promise<number | null> | null = null;

/** Tenge per US dollar from the server (null while loading or if the server does not answer). */
export function useExchangeRate(): number | null {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    cached ??= fetchPaymentConfig().then((c) => c.kztPerUsd).catch(() => {
      cached = null; // try again next time
      return null;
    });
    let alive = true;
    void cached.then((r) => alive && setRate(r));
    return () => {
      alive = false;
    };
  }, []);
  return rate;
}

/** Same rounding as the database: round(cents x rate / 100). */
export const centsToKzt = (cents: number, rate: number) => Math.round((cents * rate) / 100);
