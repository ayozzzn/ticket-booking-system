import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cancelBooking } from '@/lib/bookingApi';
import { cancelMyBooking } from '@/lib/myBookingsApi';
import { formatEventDate, formatEventTime, formatPrice } from '@/lib/format';
import type { BookingReceipt } from '@/types/ticketing';

interface CancelBookingDialogProps {
  receipt: BookingReceipt;
  email?: string;
  /** When true the cancellation goes through the signed-in account (no email needed). */
  accountMode?: boolean;
  onClose: () => void;
  onCancelled: (updated: BookingReceipt) => void;
}

export default function CancelBookingDialog({
  receipt,
  email,
  accountMode,
  onClose,
  onCancelled,
}: CancelBookingDialogProps) {
  const [understood, setUnderstood] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // The body is not locked, so the page can still scroll.
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, submitting]);

  async function handleConfirm() {
    if (!understood || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const updated = accountMode
        ? await cancelMyBooking(receipt.booking_code)
        : await cancelBooking(receipt.booking_code, email ?? receipt.customer_email);
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not cancel your booking.');
      setSubmitting(false);
    }
  }

  const tickets = `${receipt.quantity} ${receipt.quantity === 1 ? 'ticket' : 'tickets'}`;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-wine-950/80 p-4 backdrop-blur-sm sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-description"
        className="animate-modal-in relative my-8 w-full max-w-md rounded-3xl bg-cream p-5 text-wine-900 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-full p-2 text-wine-900/60 transition hover:bg-wine-900/10 hover:text-wine-900 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <h2 id="cancel-title" className="mt-4 font-display text-3xl font-semibold text-wine-900">
          Cancel this booking?
        </h2>
        <p id="cancel-description" className="mt-2 text-sm text-wine-900/75">
          Your {tickets} will be released and become available for other people. This cannot be undone.
        </p>

        <dl className="mt-5 divide-y divide-wine-900/10 rounded-2xl bg-white/60 text-sm ring-1 ring-wine-900/15">
          {[
            ['Event', receipt.event_title],
            ['Date', `${formatEventDate(receipt.event_starts_at)} at ${formatEventTime(receipt.event_starts_at)}`],
            ['Tickets', `${tickets} · ${receipt.tier_name}`],
            ['Total', formatPrice(receipt.total_cents)],
            ['Booking code', receipt.booking_code],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-wine-900/60">{label}</dt>
              <dd className="break-words text-right font-medium text-wine-900">{value}</dd>
            </div>
          ))}
        </dl>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/60 p-4 text-sm text-wine-900 ring-1 ring-wine-900/15 transition hover:bg-white">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span>I understand that this booking will be cancelled permanently.</span>
        </label>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full bg-wine-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-wine-800 disabled:opacity-50"
          >
            Keep my booking
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!understood || submitting}
            className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-wine-900/15 disabled:text-wine-900/50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Cancelling...' : 'Yes, cancel booking'}
          </button>
        </div>
      </div>
    </div>
  );
}