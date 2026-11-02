import { CheckCircle2, Ticket } from 'lucide-react';
import { formatEventDate, formatEventTime, formatPrice } from '@/lib/format';
import type { BookingReceipt } from '@/types/ticketing';

interface BookingReceiptCardProps {
  receipt: BookingReceipt;
}

export default function BookingReceiptCard({ receipt }: BookingReceiptCardProps) {
  const details: { label: string; value: string }[] = [
    { label: 'Event', value: receipt.event_title },
    {
      label: 'Date',
      value: `${formatEventDate(receipt.event_starts_at)} at ${formatEventTime(receipt.event_starts_at)}`,
    },
    { label: 'Venue', value: `${receipt.event_venue}, ${receipt.event_city}` },
    { label: 'Ticket type', value: receipt.tier_name },
    { label: 'Tickets', value: String(receipt.quantity) },
    { label: 'Total', value: formatPrice(receipt.total_cents) },
    { label: 'Name', value: receipt.customer_name },
    { label: 'Email', value: receipt.customer_email },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
        <p className="text-sm font-medium">Your tickets are reserved. Keep your booking code for entry.</p>
      </div>

      <div className="rounded-2xl border border-dashed border-teal-700/40 bg-teal-50/60 p-5 text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-800">
          <Ticket className="h-4 w-4" aria-hidden="true" />
          Booking code
        </p>
        <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.3em] text-stone-900">
          {receipt.booking_code}
        </p>
      </div>

      <dl className="divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
        {details.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-6 px-4 py-3">
            <dt className="shrink-0 text-sm text-stone-500">{item.label}</dt>
            <dd className="text-right text-sm font-medium text-stone-900 break-words">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-stone-500">Look up this booking anytime with your code and email.</p>
    </div>
  );
}
