import { ArrowRight, CheckCircle2, Clock, Info, Ticket, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import CancelBookingDialog from '@/components/CancelBookingDialog.tsx';
import { getCancelEligibility, isCancelled, timeUntil } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime } from '@/lib/format';
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
  const [justCancelled, setJustCancelled] = useState(false);

  const eligibility = getCancelEligibility(receipt, now);

  function handleCancelled(updated: BookingReceipt) {
    setOpen(false);
    setJustCancelled(true);
    onUpdated(updated);
  }

  if (isCancelled(receipt)) {
    const icons = Math.min(receipt.quantity, 10);
    return (
      <section aria-label="Cancellation details" className="space-y-5">
        {justCancelled && (
          <div
            role="status"
            className="animate-fade-up flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <p className="text-sm font-medium">
              Done! Your booking was cancelled and {receipt.quantity}{' '}
              {receipt.quantity === 1 ? 'ticket was' : 'tickets were'} released for other people.
            </p>
          </div>
        )}

        <ol className="relative space-y-5 border-l-2 border-stone-200 pl-6">
          <li className="relative">
            <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-teal-700 ring-4 ring-white" />
            <p className="text-sm font-medium text-stone-900">Booked</p>
            <p className="text-sm text-stone-500">{stamp(receipt.created_at)}</p>
          </li>
          <li className="relative">
            <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-rose-600 ring-4 ring-white" />
            <p className="text-sm font-medium text-stone-900">Cancelled</p>
            <p className="text-sm text-stone-500">
              {receipt.cancelled_at ? stamp(receipt.cancelled_at) : 'Just now'}
            </p>
          </li>
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

        <a
          href="#/"
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700"
        >
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
          <p className="text-sm font-medium text-stone-900">
            {eligibility.allowed ? 'Plans changed?' : 'Cancellation is closed'}
          </p>
          <p className="mt-0.5 text-sm text-stone-600">
            {eligibility.allowed
              ? `You can cancel this booking until the event starts (in ${timeUntil(receipt.event_starts_at, now)}).`
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

      {open && (
        <CancelBookingDialog
          receipt={receipt}
          email={email}
          accountMode={accountMode}
          onClose={() => setOpen(false)}
          onCancelled={handleCancelled}
        />
      )}
    </section>
  );
}