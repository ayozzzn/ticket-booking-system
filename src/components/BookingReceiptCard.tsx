import { CheckCircle2, Ticket, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import BookingStatusBadge from '@/components/BookingStatusBadge.tsx';
import { isCancelled } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime, formatPrice } from '@/lib/format';
import type { BookingReceipt } from '@/types/ticketing';

interface BookingReceiptCardProps {
  receipt: BookingReceipt;
}

export default function BookingReceiptCard({ receipt }: BookingReceiptCardProps) {
  const cancelled = isCancelled(receipt);
  const total = formatPrice(receipt.total_cents);

  const details: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <BookingStatusBadge status={receipt.status} /> },
    { label: 'Event', value: receipt.event_title },
    {
      label: 'Date',
      value: `${formatEventDate(receipt.event_starts_at)} at ${formatEventTime(receipt.event_starts_at)}`,
    },
    { label: 'Venue', value: `${receipt.event_venue}, ${receipt.event_city}` },
    { label: 'Ticket type', value: receipt.tier_name },
    { label: 'Tickets', value: String(receipt.quantity) },
    { label: 'Total', value: cancelled ? <s className="text-stone-400">{total}</s> : total },
    { label: 'Name', value: receipt.customer_name },
    { label: 'Email', value: receipt.customer_email },
  ];
  if (cancelled && receipt.cancelled_at) {
    details.push({
      label: 'Cancelled on',
      value: `${formatEventDate(receipt.cancelled_at)} at ${formatEventTime(receipt.cancelled_at)}`,
    });
  }

  return (
    <div className="space-y-6">
      {cancelled ? (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">
          <XCircle className="h-6 w-6 shrink-0 text-rose-700" aria-hidden="true" />
          <p className="text-sm font-medium">This booking was cancelled. The tickets have been released.</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
          <p className="text-sm font-medium">Your tickets are reserved. Keep your booking code for entry.</p>
        </div>
      )}

      <div
        className={`relative overflow-hidden rounded-2xl border border-dashed p-5 text-center transition-colors duration-500 ${
          cancelled ? 'border-stone-300 bg-stone-100' : 'border-teal-700/40 bg-teal-50/60'
        }`}
      >
        <p
          className={`flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] ${
            cancelled ? 'text-stone-500' : 'text-teal-800'
          }`}
        >
          <Ticket className="h-4 w-4" aria-hidden="true" />
          Booking code
        </p>
        <p
          className={`mt-2 font-mono text-2xl font-semibold tracking-[0.3em] ${
            cancelled ? 'text-stone-400 line-through' : 'text-stone-900'
          }`}
        >
          {receipt.booking_code}
        </p>
        {cancelled && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="animate-stamp rounded-md border-4 border-rose-600/70 bg-white/60 px-4 py-1 font-display text-2xl font-semibold uppercase tracking-widest text-rose-600/80">
              Cancelled
            </span>
          </div>
        )}
      </div>

      <dl className="divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
        {details.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-6 px-4 py-3">
            <dt className="shrink-0 text-sm text-stone-500">{item.label}</dt>
            <dd className="break-words text-right text-sm font-medium text-stone-900">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-stone-500">
        {cancelled
          ? 'This booking stays in your history for reference.'
          : 'Look up this booking anytime with your code and email.'}
      </p>
    </div>
  );
}
