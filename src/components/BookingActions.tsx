import { ArrowRight, Banknote, CheckCircle2, Clock, CreditCard, Info, Ticket, TimerOff, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import CancelBookingDialog from '@/components/CancelBookingDialog.tsx';
import HoldTimer from '@/components/payment/HoldTimer';
import PaymentModal from '@/components/payment/PaymentModal';
import { describePayment, effectiveStatus, getCancelEligibility, timeUntil } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime, formatKzt } from '@/lib/format';
import type { BookingReceipt } from '@/types/ticketing';

interface BookingActionsProps {
  receipt: BookingReceipt;
  /** Called with the fresh booking after a successful cancellation. */
  onUpdated: (receipt: BookingReceipt) => void;
  /** Optional: email to use for cancellation (guest lookup flow). */
  email?: string;
  /** When true the booking is cancelled through the signed-in account (profile page). */
  accountMode?: boolean;
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const stamp = (iso: string) => `${formatEventDate(iso)} · ${formatEventTime(iso)}`;

export default function BookingActions({ receipt, onUpdated, email, accountMode }: BookingActionsProps) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  // The payment dialog keeps the booking as it was when it opened, so its success screen survives the page update.
  const [payTarget, setPayTarget] = useState<BookingReceipt | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);

  const status = effectiveStatus(receipt, now);
  const eligibility = getCancelEligibility(receipt, now);

  function handleCancelled(updated: BookingReceipt) {
    setJustCancelled(true);
    onUpdated(updated); // the dialog stays open to show the refund; it closes when the customer presses Done
  }

  const dialogs = (
    <>
      {open && (
        <CancelBookingDialog
          receipt={receipt}
          email={email}
          accountMode={accountMode}
          onClose={() => setOpen(false)}
          onCancelled={handleCancelled}
        />
      )}
      {payTarget && (
        <PaymentModal
          receipt={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={onUpdated}
          onExpired={() => {
            setPayTarget(null);
            onUpdated({ ...receipt, status: 'expired' });
          }}
        />
      )}
    </>
  );

  // The dialogs live outside the branches below, so they survive when the booking changes status
  // (for example the cancel dialog keeps showing the refund after the booking became 'cancelled').
  const content = (() => {
  if (status === 'expired') {
    return (
      <section aria-label="Reservation expired" className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-stone-100 p-4 text-stone-800 ring-1 ring-stone-300">
          <TimerOff className="mt-0.5 h-5 w-5 shrink-0 text-stone-600" aria-hidden="true" />
          <p className="text-sm">The time to pay ran out, so the tickets were released. Nothing was charged.</p>
        </div>
        <a href="#/" className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700">
          Choose tickets again
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </section>
    );
  }

  if (status === 'pending') {
    return (
      <section aria-label="Complete payment" className="space-y-4">
        <HoldTimer holdExpiresAt={receipt.hold_expires_at} onExpire={() => onUpdated({ ...receipt, status: 'expired' })} />
        <button
          type="button"
          onClick={() => setPayTarget(receipt)}
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3.5 text-sm font-semibold text-cream shadow-sm transition hover:bg-crimson-bright hover:shadow-md"
        >
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Pay {receipt.total_kzt ? formatKzt(receipt.total_kzt) : 'now'}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-rose-300 bg-white py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-600 hover:bg-rose-600 hover:text-white"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Release the tickets
        </button>
      </section>
    );
  }

  if (status === 'cancelled') {
    const icons = Math.min(receipt.quantity, 10);
    const pay = receipt.payment;
    return (
      <section aria-label="Cancellation details" className="space-y-5">
        {justCancelled && (
          <div role="status" className="animate-fade-up flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <p className="text-sm font-medium">
              Done! Your booking was cancelled and {receipt.quantity} {receipt.quantity === 1 ? 'ticket was' : 'tickets were'} released for other people.
            </p>
          </div>
        )}

        <ol className="relative space-y-5 border-l-2 border-stone-200 pl-6">
          <li className="relative">
            <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-teal-700 ring-4 ring-white" />
            <p className="text-sm font-medium text-stone-900">Booked</p>
            <p className="text-sm text-stone-500">{stamp(receipt.created_at)}</p>
          </li>
          {pay?.paid_at && (
            <li className="relative">
              <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-emerald-600 ring-4 ring-white" />
              <p className="text-sm font-medium text-stone-900">Paid {formatKzt(pay.amount_kzt)}</p>
              <p className="text-sm text-stone-500">{stamp(pay.paid_at)} · {describePayment(pay)}</p>
            </li>
          )}
          <li className="relative">
            <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-rose-600 ring-4 ring-white" />
            <p className="text-sm font-medium text-stone-900">Cancelled</p>
            <p className="text-sm text-stone-500">{receipt.cancelled_at ? stamp(receipt.cancelled_at) : 'Just now'}</p>
          </li>
          {pay && pay.status === 'paid' && pay.refund_percent !== null && (
            <li className="relative">
              <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${pay.refund_status === 'refunded' ? 'bg-emerald-600' : 'bg-amber-500'}`} />
              <p className="flex items-center gap-2 text-sm font-medium text-stone-900">
                <Banknote className="h-4 w-4 text-stone-500" aria-hidden="true" />
                {pay.refund_kzt > 0 ? `Refund ${formatKzt(pay.refund_kzt)} (${pay.refund_percent}%)` : 'No refund (too close to the event)'}
              </p>
              {pay.refund_kzt > 0 && (
                <p className="text-sm text-stone-500">
                  {pay.refund_status === 'refunded' && pay.refunded_at ? `Sent ${stamp(pay.refunded_at)}` : 'Being processed'}
                </p>
              )}
            </li>
          )}
        </ol>

        <div className="flex flex-wrap items-center gap-2" aria-label={`${receipt.quantity} tickets released`}>
          {Array.from({ length: icons }).map((_, i) => (
            <span
              key={i}
              style={{ animationDelay: `${i * 60}ms` }}
              className="animate-fade-up flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-400 ring-1 ring-stone-200"
            >
              <Ticket className="h-4 w-4" aria-hidden="true" />
            </span>
          ))}
          <span className="ml-1 text-xs text-stone-500">released</span>
        </div>

        <a href="#/" className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700">
          Browse other events
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </section>
    );
  }

  return (
    <section aria-label="Manage booking" className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
        {eligibility.allowed ? (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-teal-800" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-medium text-stone-900">{eligibility.allowed ? 'Plans changed?' : 'Cancellation is closed'}</p>
          <p className="mt-0.5 text-sm text-stone-600">
            {eligibility.allowed
              ? `You can cancel this booking until the event starts (in ${timeUntil(receipt.event_starts_at, now)}).${
                  receipt.refund_quote ? ` If you cancel now you get back ${formatKzt(receipt.refund_quote.kzt)} (${receipt.refund_quote.percent}%).` : ''
                }`
              : eligibility.reason}
          </p>
        </div>
      </div>

      {eligibility.allowed && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center justify-center gap-2 rounded-full border border-rose-300 bg-white py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-600 hover:bg-rose-600 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-600/20"
        >
          <XCircle className="h-4 w-4 transition group-hover:rotate-90" aria-hidden="true" />
          Cancel booking
        </button>
      )}
    </section>
  );
  })();

  return (
    <>
      {content}
      {dialogs}
    </>
  );
}
