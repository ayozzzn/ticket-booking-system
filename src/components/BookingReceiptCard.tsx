import { CheckCircle2, Clock, TimerOff, Ticket, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import BookingStatusBadge from '@/components/BookingStatusBadge.tsx';
import { describePayment, effectiveStatus } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime, formatKzt, formatPrice } from '@/lib/format';
import type { BookingReceipt } from '@/types/ticketing';

interface BookingReceiptCardProps {
  receipt: BookingReceipt;
}

export default function BookingReceiptCard({ receipt }: BookingReceiptCardProps) {
  const status = effectiveStatus(receipt);
  const cancelled = status === 'cancelled';
  const dead = cancelled || status === 'expired';
  const pending = status === 'pending';
  const pay = receipt.payment;
  const total = receipt.total_kzt ? formatKzt(receipt.total_kzt) : formatPrice(receipt.total_cents);

  const details: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <BookingStatusBadge status={status} /> },
    { label: 'Event', value: receipt.event_title },
    {
      label: 'Date',
      value: `${formatEventDate(receipt.event_starts_at)} at ${formatEventTime(receipt.event_starts_at)}`,
    },
    { label: 'Venue', value: `${receipt.event_venue}, ${receipt.event_city}` },
    { label: 'Ticket type', value: receipt.tier_name },
    { label: 'Tickets', value: String(receipt.quantity) },
    ...(receipt.seat_labels && receipt.seat_labels.length > 0
      ? [{ label: 'Seats', value: receipt.seat_labels.join(', ') }]
      : []),
    { label: 'Total', value: dead && !pay?.refund_kzt ? <s className="text-wine-900/40">{total}</s> : total },
  ];
  if (pay && pay.status === 'paid') {
    details.push({ label: 'Paid with', value: describePayment(pay) });
    if (pay.paid_at) {
      details.push({ label: 'Paid on', value: `${formatEventDate(pay.paid_at)} at ${formatEventTime(pay.paid_at)}` });
    }
  }
  details.push({ label: 'Name', value: receipt.customer_name }, { label: 'Email', value: receipt.customer_email });
  if (cancelled && receipt.cancelled_at) {
    details.push({
      label: 'Cancelled on',
      value: `${formatEventDate(receipt.cancelled_at)} at ${formatEventTime(receipt.cancelled_at)}`,
    });
  }
  if (cancelled && pay && pay.refund_percent !== null && pay.status === 'paid') {
    details.push({
      label: 'Refund',
      value: pay.refund_kzt > 0
        ? `${formatKzt(pay.refund_kzt)} (${pay.refund_percent}%) · ${pay.refund_status === 'refunded' ? 'sent' : 'processing'}`
        : 'None (too close to the event)',
    });
  }

  return (
    <div className="space-y-6">
      {cancelled ? (
        <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-900 ring-1 ring-red-200">
          <XCircle className="h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
          <p className="text-sm font-medium">This booking was cancelled. The tickets have been released.</p>
        </div>
      ) : status === 'expired' ? (
        <div className="flex items-center gap-3 rounded-2xl bg-stone-100 p-4 text-stone-800 ring-1 ring-stone-300">
          <TimerOff className="h-6 w-6 shrink-0 text-stone-600" aria-hidden="true" />
          <p className="text-sm font-medium">This reservation was not paid in time, so the tickets were released. No money was taken.</p>
        </div>
      ) : pending ? (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <Clock className="h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-sm font-medium">Your tickets are held, but they are not yours until you pay.</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
          <p className="text-sm font-medium">Your tickets are reserved. Keep your booking code for entry.</p>
        </div>
      )}

      <div
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-5 text-center transition-colors duration-500 ${
          dead ? 'border-wine-900/25 bg-wine-900/5' : pending ? 'border-amber-500/50 bg-amber-500/5' : 'border-crimson/45 bg-crimson/5'
        }`}
      >
        <p className={`flex items-center justify-center gap-2 text-sm font-semibold ${dead ? 'text-wine-900/50' : 'text-crimson'}`}>
          <Ticket className="h-4 w-4" aria-hidden="true" />
          Booking code
        </p>
        <p className={`mt-2 font-mono text-2xl font-semibold tracking-[0.3em] ${dead ? 'text-wine-900/40 line-through' : 'text-wine-900'}`}>
          {receipt.booking_code}
        </p>
        {dead && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="animate-stamp rounded-md border-4 border-red-600/70 bg-white/60 px-4 py-1 font-display text-2xl font-bold uppercase tracking-widest text-red-600/80">
              {cancelled ? 'Cancelled' : 'Expired'}
            </span>
          </div>
        )}
      </div>

      <dl className="divide-y divide-wine-900/10 rounded-2xl bg-white/60 ring-1 ring-wine-900/15">
        {details.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-6 px-4 py-3">
            <dt className="shrink-0 text-sm text-wine-900/60">{item.label}</dt>
            <dd className="break-words text-right text-sm font-medium text-wine-900">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-wine-900/60">
        {dead ? 'This booking stays in your history for reference.' : 'Look up this booking anytime with your code and email.'}
      </p>
    </div>
  );
}
