import { AlertCircle, Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import BookingReceiptCard from '@/components/BookingReceiptCard';
import FormField from '@/components/FormField';
import { createBooking } from '@/lib/bookingApi';
import { formatPrice, ticketsRemaining } from '@/lib/format';
import type { BookingReceipt, EventRecord, TicketTier } from '@/types/ticketing';

const MAX_TICKETS_PER_BOOKING = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CheckoutModalProps {
  event: EventRecord;
  tier: TicketTier;
  onClose: () => void;
  onBooked: () => void;
}

export default function CheckoutModal({ event, tier, onClose, onBooked }: CheckoutModalProps) {
  const maxQuantity = Math.min(MAX_TICKETS_PER_BOOKING, ticketsRemaining(tier));
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const close = () => {
    if (!submitting) onClose();
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Please enter your name.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createBooking({
        tierId: tier.id,
        quantity,
        customerName: name.trim(),
        customerEmail: email.trim(),
      });
      setReceipt(result);
      onBooked();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Your booking could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  const total = tier.price_cents * quantity;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="animate-modal-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-800">{event.title}</p>
            <h2 id="checkout-title" className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
              {receipt ? 'Booking confirmed' : `${tier.name} tickets`}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {receipt ? (
          <div className="mt-6 space-y-6">
            <BookingReceiptCard receipt={receipt} />
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full bg-slate-900 py-3.5 font-semibold text-white transition hover:bg-slate-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
            <div className="flex items-center justify-between rounded-2xl bg-paper p-4 ring-1 ring-slate-200">
              <div>
                <p className="font-medium text-slate-900">Number of tickets</p>
                <p className="text-sm text-slate-600">
                  {formatPrice(tier.price_cents)} each · up to {maxQuantity} available
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Remove one ticket"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || submitting}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="w-6 text-center text-lg font-semibold tabular-nums text-slate-900" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Add one ticket"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity || submitting}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <FormField
              id="customer-name"
              label="Full name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Alex Morgan"
            />
            <FormField
              id="customer-email"
              label="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="you@example.com"
            />
            <p className="-mt-3 text-sm text-slate-500">Your booking code will be sent to this address.</p>

            {formError && (
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-5">
              <span className="text-slate-600">Total</span>
              <span className="font-display text-3xl font-bold text-slate-900">{formatPrice(total)}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-800 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Confirming...' : 'Confirm booking'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
