import { AlertCircle, Clock, Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import FormField from '@/components/FormField';
import SeatPicker from '@/components/SeatPicker';
import PaymentModal from '@/components/payment/PaymentModal';
import { centsToKzt, useExchangeRate } from '@/hooks/useExchangeRate';
import { useSession } from '@/hooks/useSession';
import { createBooking, createSeatBooking } from '@/lib/bookingApi';
import { formatKzt, formatPrice, ticketsRemaining } from '@/lib/format';
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
  const { session } = useSession();
  const rate = useExchangeRate();
  const maxQuantity = Math.min(MAX_TICKETS_PER_BOOKING, ticketsRemaining(tier));
  const reserved = tier.seating === 'reserved';
  const [quantity, setQuantity] = useState(1);
  const [seatIds, setSeatIds] = useState<string[]>([]);
  const [seatMapVersion, setSeatMapVersion] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);

  // Prefill from the signed-in account (only fills empty fields, so typing is never overwritten).
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    setEmail((prev) => prev || user.email || '');
    setName((prev) => prev || (user.user_metadata?.full_name as string | undefined) || '');
  }, [session]);

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
    if (reserved && seatIds.length === 0) {
      setFormError('Please choose at least one seat.');
      return;
    }

    setSubmitting(true);
    try {
      const result = reserved
        ? await createSeatBooking({
            tierId: tier.id,
            seatIds,
            customerName: name.trim(),
            customerEmail: email.trim(),
          })
        : await createBooking({
            tierId: tier.id,
            quantity,
            customerName: name.trim(),
            customerEmail: email.trim(),
          });
      setReceipt(result);
      onBooked();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Your booking could not be completed.';
      setFormError(message);
      // Somebody else took a seat first: reload the map so the customer sees what is still free.
      if (reserved && /seat/i.test(message)) setSeatMapVersion((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const ticketCount = reserved ? seatIds.length : quantity;
  const total = tier.price_cents * ticketCount;
  const free = tier.price_cents === 0;

  if (receipt) {
    return (
      <PaymentModal
        receipt={receipt}
        onClose={() => {
          onBooked();
          onClose();
        }}
        onPaid={(paid) => {
          setReceipt(paid);
          onBooked();
        }}
        onExpired={() => {
          onBooked();
          onClose();
        }}
      />
    );
  }

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-wine-950/80 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className={`animate-modal-in max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-cream p-6 text-wine-900 shadow-2xl sm:p-8 ${
          reserved ? 'max-w-xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-crimson">{event.title}</p>
            <h2 id="checkout-title" className="mt-1 font-display text-3xl font-semibold text-wine-900">
              {`${tier.name} tickets`}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            aria-label="Close"
            className="rounded-full p-2 text-wine-900/60 transition hover:bg-wine-900/10 hover:text-wine-900 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
          {reserved ? (
            <SeatPicker
              tier={tier}
              maxSeats={maxQuantity}
              selectedIds={seatIds}
              onChange={setSeatIds}
              reloadKey={seatMapVersion}
            />
          ) : (
            <div className="flex items-center justify-between rounded-2xl bg-white/60 p-4 ring-1 ring-wine-900/15">
              <div>
                <p className="font-medium text-wine-900">Number of tickets</p>
                <p className="text-sm text-wine-900/70">
                  {free ? 'Free' : formatPrice(tier.price_cents)} each · up to {maxQuantity} available
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Remove one ticket"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || submitting}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-wine-900 ring-1 ring-wine-900/25 transition hover:bg-crimson hover:text-cream disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-wine-900"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="w-6 text-center text-lg font-semibold tabular-nums text-wine-900" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Add one ticket"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity || submitting}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-wine-900 ring-1 ring-wine-900/25 transition hover:bg-crimson hover:text-cream disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-wine-900"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

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
          <p className="-mt-3 text-sm text-wine-900/65">
            {session
              ? 'You are logged in: this booking will appear in your profile.'
              : 'Use the same email later to find or cancel your booking.'}
          </p>

          {formError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <div className="border-t-2 border-dashed border-crimson/35 pt-5">
            <div className="flex items-end justify-between gap-4">
              <span className="pb-1 text-wine-900/70">
                Total{reserved && ` · ${ticketCount} ${ticketCount === 1 ? 'seat' : 'seats'}`}
              </span>
              <div className="text-right">
                <span className="block font-display text-4xl font-semibold text-wine-900">
                  {free ? 'Free' : rate ? formatKzt(centsToKzt(total, rate)) : formatPrice(total)}
                </span>
                {!free && rate && <span className="text-xs text-wine-900/55">{formatPrice(total)} at 1 $ = {rate} ₸</span>}
              </div>
            </div>
            {!free && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-wine-900/5 p-3 text-xs text-wine-900/70">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Next you pay by card, Kaspi QR or Halyk QR. We hold your tickets for 10 minutes while you pay.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || (reserved && seatIds.length === 0)}
            className={`flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3.5 font-semibold text-cream shadow-sm transition hover:bg-crimson-bright hover:shadow-md disabled:opacity-70 ${
              submitting ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'
            }`}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting
              ? 'Reserving your tickets...'
              : reserved && seatIds.length === 0
                ? 'Choose your seats'
                : free
                  ? 'Confirm free booking'
                  : 'Continue to payment'}
          </button>
        </form>
      </div>
    </div>
  );
}