import type { BookingReceipt } from '@/types/ticketing';

/** Bookings created before the status column existed have no status: treat them as confirmed. */
export function isCancelled(booking: Pick<BookingReceipt, 'status'>): boolean {
  return booking.status === 'cancelled';
}

export type CancelEligibility = { allowed: true } | { allowed: false; reason: string };

/** UI-side check. The database enforces the same rules, so this only improves the experience. */
export function getCancelEligibility(
  booking: Pick<BookingReceipt, 'status' | 'event_starts_at'>,
  now: Date = new Date(),
): CancelEligibility {
  if (isCancelled(booking)) {
    return { allowed: false, reason: 'This booking is already cancelled.' };
  }
  if (new Date(booking.event_starts_at).getTime() <= now.getTime()) {
    return {
      allowed: false,
      reason: 'This event has already started, so the booking can no longer be cancelled.',
    };
  }
  return { allowed: true };
}

/** "3 days 4 h", "5 h 20 min", "12 min" */
export function timeUntil(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'already started';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`;
  if (hours >= 1) return `${hours} h ${minutes} min`;
  return `${Math.max(minutes, 1)} min`;
}
