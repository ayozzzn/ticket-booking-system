import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import QrCode from '@/components/payment/QrCode';
import { describePayment } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime, formatKzt } from '@/lib/format';
import type { BookingReceipt } from '@/types/ticketing';

interface PaymentSuccessProps {
  receipt: BookingReceipt;
  loggedIn: boolean;
  onDone: () => void;
}

const CONFETTI = ['#9b1c2c', '#d8a48f', '#c42a3c', '#4a0d14', '#f4e8df', '#d8a48f'];

/** Big animated check, a few paper pieces, and the ticket with a QR the guard can scan. */
export default function PaymentSuccess({ receipt, loggedIn, onDone }: PaymentSuccessProps) {
  const free = (receipt.total_kzt ?? 0) === 0;
  return (
    <div className="space-y-6 text-center">
      <div className="relative mx-auto h-24 w-24">
        <span className="absolute inset-0 animate-pop-ring rounded-full bg-emerald-500/40" />
        <span className="absolute inset-0 animate-pop-ring rounded-full bg-emerald-500/30 [animation-delay:0.18s]" />
        <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-900/30">
          <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="30" strokeDashoffset="30" className="animate-draw-check" />
          </svg>
        </span>
        <span className="pointer-events-none absolute -inset-x-16 -top-6 h-0" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className="absolute top-0 h-2.5 w-1.5 animate-confetti-fall rounded-sm"
              style={{
                left: `${6 + ((i * 37) % 88)}%`,
                backgroundColor: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i % 6) * 0.08}s`,
                animationDuration: `${1.3 + (i % 5) * 0.15}s`,
              }}
            />
          ))}
        </span>
      </div>

      <div className="animate-fade-up">
        <h3 className="font-display text-4xl font-bold text-wine-900">{free ? 'You are in!' : 'Payment received'}</h3>
        <p className="mt-2 text-sm text-wine-900/70">
          {free ? 'Your free tickets are confirmed.' : 'Thank you! Your tickets are confirmed.'}{' '}
          A copy is saved under your booking code.
        </p>
      </div>

      {/* The ticket */}
      <div className="animate-fade-up overflow-hidden rounded-2xl bg-white text-left shadow-xl shadow-wine-900/15 ring-1 ring-wine-900/10 [animation-delay:0.15s]">
        <div className="bg-gradient-to-r from-crimson to-wine-800 px-5 py-4 text-cream">
          <p className="text-[10px] uppercase tracking-[0.25em] text-cream/70">Kesh · admit {receipt.quantity}</p>
          <p className="mt-1 font-display text-2xl font-bold leading-tight">{receipt.event_title}</p>
          <p className="text-sm text-cream/80">{receipt.tier_name}</p>
        </div>
        <div className="relative grid gap-4 border-t-2 border-dashed border-crimson/35 p-5 before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-cream after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-cream sm:grid-cols-[1fr_auto]">
          <div className="space-y-2 text-sm text-wine-900">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-crimson" aria-hidden="true" />{formatEventDate(receipt.event_starts_at)} · {formatEventTime(receipt.event_starts_at)}</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-crimson" aria-hidden="true" />{receipt.event_venue}, {receipt.event_city}</p>
            <div className="pt-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-wine-900/50">Booking code</p>
              <p className="font-mono text-xl font-semibold tracking-[0.25em]">{receipt.booking_code}</p>
            </div>
            {!free && receipt.payment && (
              <p className="text-xs text-wine-900/65">
                Paid {formatKzt(receipt.payment.amount_kzt)} · {describePayment(receipt.payment)}
              </p>
            )}
          </div>
          <div className="mx-auto w-28 shrink-0 text-center">
            <QrCode text={`KESH:${receipt.booking_code}`} size={112} label="Entry QR code" className="h-auto w-full rounded-lg ring-1 ring-wine-900/10" />
            <p className="mt-1 text-[10px] text-wine-900/55">Show at the entrance</p>
          </div>
        </div>
      </div>

      {loggedIn && (
        <p className="text-sm text-wine-900/75">
          Saved in your{' '}
          <a href="#/profile" onClick={onDone} className="font-medium text-crimson underline">profile</a>
          , where you can also cancel it.
        </p>
      )}

      <button
        type="button"
        onClick={onDone}
        className="group flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3.5 font-semibold text-cream transition hover:bg-crimson-bright"
      >
        Done
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
      </button>
    </div>
  );
}
