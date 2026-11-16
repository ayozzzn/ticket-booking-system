import { AlertTriangle, ArrowRight, Check, Loader2, Undo2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cancelBooking } from '@/lib/bookingApi';
import { describePayment } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime, formatKzt, formatPrice } from '@/lib/format';
import { cancelMyBooking } from '@/lib/myBookingsApi';
import type { BookingReceipt } from '@/types/ticketing';

interface CancelBookingDialogProps {
  receipt: BookingReceipt;
  email?: string;
  /** When true the cancellation goes through the signed-in account (no email needed). */
  accountMode?: boolean;
  onClose: () => void;
  /** Called as soon as the server cancelled, so the page behind can update. The dialog stays open to show the result. */
  onCancelled: (updated: BookingReceipt) => void;
}

const TIERS = [
  { percent: 100, label: '2 days or more before', note: 'Full refund' },
  { percent: 75, label: '1 to 2 days before', note: '75% back' },
  { percent: 50, label: 'Less than 1 day before', note: '50% back' },
];

export default function CancelBookingDialog({ receipt: liveReceipt, email, accountMode, onClose, onCancelled }: CancelBookingDialogProps) {
  // The page behind updates when the cancellation succeeds; this dialog keeps describing the booking as it was.
  const [receipt] = useState(liveReceipt);
  const [understood, setUnderstood] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BookingReceipt | null>(null);

  const unpaid = receipt.status === 'pending';
  const paid = receipt.payment?.status === 'paid';
  const quote = receipt.refund_quote;
  const paidKzt = receipt.payment?.amount_kzt ?? 0;
  const legacyPaid = !unpaid && !paid && receipt.total_cents > 0; // booked before online payments existed
  const tickets = `${receipt.quantity} ${receipt.quantity === 1 ? 'ticket' : 'tickets'}`;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  async function handleConfirm() {
    if (!understood || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const started = Date.now();
      const updated = accountMode
        ? await cancelMyBooking(receipt.booking_code)
        : await cancelBooking(receipt.booking_code, email ?? receipt.customer_email);
      // Let the progress steps be seen even when the server is fast.
      const wait = 1400 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
      setResult(updated);
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not cancel your booking.');
    } finally {
      setSubmitting(false);
    }
  }

  const shell = (children: ReactNode) => (
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-wine-950/80 p-4 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        className="animate-modal-in relative my-8 w-full max-w-md rounded-3xl bg-cream p-5 text-wine-900 shadow-2xl sm:p-6"
      >
        {children}
      </div>
    </div>
  );

  // ---- result screen ---------------------------------------------------------------------
  if (result) {
    const pay = result.payment;
    const refunded = pay?.refund_status === 'refunded';
    const refundPending = pay?.refund_status === 'pending';
    const hasRefund = !!pay && pay.refund_kzt > 0;
    const kept = pay ? pay.amount_kzt - pay.refund_kzt : 0;
    return shell(
      <div className="space-y-6 text-center">
        <div className="relative mx-auto h-20 w-20">
          <span className="absolute inset-0 animate-pop-ring rounded-full bg-emerald-500/40" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="30" strokeDashoffset="30" className="animate-draw-check" />
            </svg>
          </span>
        </div>
        <div>
          <h2 id="cancel-title" className="font-display text-3xl font-semibold">
            {unpaid ? 'Tickets released' : 'Booking cancelled'}
          </h2>
          <p className="mt-2 text-sm text-wine-900/70">
            {tickets} {receipt.quantity === 1 ? 'was' : 'were'} released for other people.
          </p>
        </div>

        {hasRefund && pay && (
          <div className="animate-fade-up rounded-2xl bg-white p-4 text-left ring-1 ring-wine-900/15">
            <p className="text-xs uppercase tracking-[0.2em] text-wine-900/50">Your refund</p>
            <p className="mt-1 font-display text-4xl font-semibold text-emerald-700">{formatKzt(pay.refund_kzt)}</p>
            <p className="mt-1 text-sm text-wine-900/70">
              {pay.refund_percent}% of {formatKzt(pay.amount_kzt)}, back to {describePayment(pay)}
            </p>
            <p className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${refunded ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
              {refunded ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
              {refunded
                ? 'The refund was sent. Your bank may need a few working days to show it.'
                : refundPending
                  ? 'The refund is being processed. You do not need to do anything.'
                  : ''}
            </p>
            {kept > 0 && <p className="mt-2 text-xs text-wine-900/55">{formatKzt(kept)} stays with the organiser under the cancellation policy.</p>}
          </div>
        )}
        {!hasRefund && paid && (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            No refund is due this close to the event.
          </p>
        )}

        <button type="button" onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 font-semibold text-cream transition hover:bg-crimson-bright">
          Done
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>,
    );
  }

  // ---- working screen --------------------------------------------------------------------
  if (submitting) {
    const steps = unpaid ? ['Releasing your tickets'] : paid ? ['Cancelling the booking', 'Releasing your tickets', 'Sending the refund'] : ['Cancelling the booking', 'Releasing your tickets'];
    return shell(
      <div className="space-y-6 py-4 text-center" role="status" aria-live="polite">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-crimson" aria-hidden="true" />
        <h2 id="cancel-title" className="font-display text-3xl font-semibold">Working on it...</h2>
        <ul className="mx-auto max-w-xs space-y-3 text-left text-sm">
          {steps.map((label, i) => (
            <li key={label} className="animate-fade-up flex items-center gap-3" style={{ animationDelay: `${i * 350}ms` }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-crimson/10 text-crimson">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>,
    );
  }

  // ---- question screen -------------------------------------------------------------------
  const refundKzt = quote?.kzt ?? 0;
  return shell(
    <>
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${unpaid ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>
          {unpaid ? <Undo2 className="h-6 w-6" aria-hidden="true" /> : <AlertTriangle className="h-6 w-6" aria-hidden="true" />}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-wine-900/60 transition hover:bg-wine-900/10 hover:text-wine-900">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <h2 id="cancel-title" className="mt-4 font-display text-3xl font-semibold text-wine-900">
        {unpaid ? 'Release these tickets?' : 'Cancel this booking?'}
      </h2>
      <p className="mt-2 text-sm text-wine-900/75">
        {unpaid
          ? `Your ${tickets} will be released. You have not paid yet, so no money is involved.`
          : `Your ${tickets} will be released and become available for other people. This cannot be undone.`}
      </p>

      <dl className="mt-5 divide-y divide-wine-900/10 rounded-2xl bg-white/60 text-sm ring-1 ring-wine-900/15">
        {[
          ['Event', receipt.event_title],
          ['Date', `${formatEventDate(receipt.event_starts_at)} at ${formatEventTime(receipt.event_starts_at)}`],
          ['Tickets', `${tickets} · ${receipt.tier_name}`],
          ['Total', receipt.total_kzt ? formatKzt(receipt.total_kzt) : formatPrice(receipt.total_cents)],
          ['Booking code', receipt.booking_code],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-wine-900/60">{label}</dt>
            <dd className="break-words text-right font-medium text-wine-900">{value}</dd>
          </div>
        ))}
      </dl>

      {paid && quote && receipt.payment && (
        <div className="mt-5 space-y-4 rounded-2xl bg-white p-4 ring-1 ring-wine-900/15">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-wine-900/50">You get back</p>
              <p className={`font-display text-4xl font-semibold ${refundKzt > 0 ? 'text-emerald-700' : 'text-wine-900'}`}>{formatKzt(refundKzt)}</p>
            </div>
            <p className="pb-1 text-right text-xs text-wine-900/60">
              {quote.percent}% of {formatKzt(paidKzt)}
              <br />to {describePayment(receipt.payment)}
            </p>
          </div>
          <div>
            <div className="flex gap-1" role="img" aria-label={`Refund policy: ${TIERS.map((t) => `${t.label} ${t.percent}%`).join(', ')}. Now: ${quote.percent}%`}>
              {TIERS.map((t) => {
                const active = t.percent === quote.percent;
                return (
                  <div key={t.percent} className={`flex-1 rounded-lg px-2 py-2 text-center transition ${active ? 'bg-crimson text-cream shadow-md' : 'bg-wine-900/5 text-wine-900/55'}`}>
                    <p className="font-display text-xl font-semibold leading-none">{t.percent}%</p>
                    <p className="mt-1 text-[10px] leading-tight">{t.label}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-wine-900/55">The final amount is calculated at the moment you confirm.</p>
          </div>
        </div>
      )}

      {legacyPaid && (
        <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          This booking was made before online payments. It can be cancelled here, but any refund is arranged with the organiser.
        </p>
      )}

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/60 p-4 text-sm text-wine-900 ring-1 ring-wine-900/15 transition hover:bg-white">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
        <span>
          {unpaid
            ? 'I want to release these tickets.'
            : paid && refundKzt < paidKzt
              ? `I understand that I get back ${formatKzt(refundKzt)} and the booking is cancelled permanently.`
              : 'I understand that this booking will be cancelled permanently.'}
        </span>
      </label>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="rounded-full bg-wine-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-wine-800">
          {unpaid ? 'Keep my tickets' : 'Keep my booking'}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!understood}
          className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-wine-900/15 disabled:text-wine-900/50"
        >
          {unpaid ? 'Yes, release tickets' : 'Yes, cancel booking'}
        </button>
      </div>
    </>,
  );
}
