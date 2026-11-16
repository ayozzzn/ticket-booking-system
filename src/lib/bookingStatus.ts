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
  if (booking.status === 'expired') {
    return { allowed: false, reason: 'This reservation expired because it was not paid in time.' };
  }
  if (booking.status === 'pending') return { allowed: true }; // giving up an unpaid reservation is always possible
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

// ---- payments -----------------------------------------------------------------------------

/** The tickets are held but not paid yet. */
export function isPending(booking: Pick<BookingReceipt, 'status' | 'hold_expires_at'>, now: Date = new Date()): boolean {
  if (booking.status !== 'pending') return false;
  return !booking.hold_expires_at || new Date(booking.hold_expires_at).getTime() > now.getTime();
}

/** Unpaid and out of time (the server releases the tickets within a minute, the screen should not wait for that). */
export function isExpired(booking: Pick<BookingReceipt, 'status' | 'hold_expires_at'>, now: Date = new Date()): boolean {
  if (booking.status === 'expired') return true;
  return booking.status === 'pending' && !!booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() <= now.getTime();
}

/** Money was paid for this booking and it is still valid. */
export function isPaidConfirmed(booking: Pick<BookingReceipt, 'status' | 'payment'>): boolean {
  return (booking.status === 'confirmed' || booking.status === null) && booking.payment?.status === 'paid';
}

export const METHOD_LABEL = {
  card: 'Bank card',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
} as const;

export function describePayment(payment: NonNullable<BookingReceipt['payment']>): string {
  if (payment.method === 'card') {
    const brand = payment.card_brand === 'visa' ? 'Visa' : payment.card_brand === 'mastercard' ? 'Mastercard' : 'Card';
    return payment.card_last4 ? `${brand} •••• ${payment.card_last4}` : brand;
  }
  return METHOD_LABEL[payment.method];
}

/** The status the screen should show: a pending booking whose timer ran out is shown as expired at once. */
export function effectiveStatus(
  booking: Pick<BookingReceipt, 'status' | 'hold_expires_at'>,
  now: Date = new Date(),
): 'pending' | 'confirmed' | 'cancelled' | 'expired' {
  if (isExpired(booking, now)) return 'expired';
  return booking.status ?? 'confirmed';
}
