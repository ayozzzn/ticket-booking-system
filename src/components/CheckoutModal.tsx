import { AlertCircle, Clock, Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import FormField from '@/components/FormField';
import PaymentModal from '@/components/payment/PaymentModal';
import SeatPicker from '@/components/SeatPicker';
import { centsToKzt, useExchangeRate } from '@/hooks/useExchangeRate';
import { useSession } from '@/hooks/useSession';
import { createBooking, createFareBooking, createSeatBooking } from '@/lib/bookingApi';
import { timeLabel } from '@/lib/calendar';
import { sortedFares } from '@/lib/sessions';
import { formatEventDate, formatKzt, formatPrice, ticketsRemaining } from '@/lib/format';
import type { BookingReceipt, EventRecord, Fare, TicketTier } from '@/types/ticketing';

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
  // Reserved seating: the customer picks seats on a map instead of a quantity.
  const reserved = tier.seating === 'reserved';
  const [quantity, setQuantity] = useState(1);
  const [seatIds, setSeatIds] = useState<string[]>([]);
  const [seatMapVersion, setSeatMapVersion] = useState(0);

  // Movie sessions sell several ticket types (Adult / Student / Child) with tenge prices.
  const fares = useMemo(() => sortedFares(tier), [tier]);
  const withFares = fares.length > 0;
  // With a seat map the first type (Adult) gets every seat not given another type,
  // so the types always add up to the chosen seats. Without seats every type is counted freely.
  const [fareCounts, setFareCounts] = useState<Record<string, number>>(() =>
    withFares && !reserved ? { [fares[0].id]: 1 } : {},
  );
  const otherFareTotal = fares.slice(1).reduce((n, f) => n + (fareCounts[f.id] ?? 0), 0);
  const countOf = (fare: Fare) =>
    reserved && fare.id === fares[0]?.id ? Math.max(0, seatIds.length - otherFareTotal) : (fareCounts[fare.id] ?? 0);

  // Fewer seats than special tickets (a seat was removed): take the extra ones back, last type first.
  useEffect(() => {
    if (!withFares || !reserved || otherFareTotal <= seatIds.length) return;
    setFareCounts((prev) => {
      const next = { ...prev };
      let extra = otherFareTotal - seatIds.length;
      for (const f of [...fares.slice(1)].reverse()) {
        const take = Math.min(extra, next[f.id] ?? 0);
        next[f.id] = (next[f.id] ?? 0) - take;
        extra -= take;
      }
      return next;
    });
  }, [withFares, reserved, otherFareTotal, seatIds.length, fares]);
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

    if (reserved && seatIds.length === 0) {
      setFormError('Please choose at least one seat.');
      return;
    }
    if (withFares && ticketCount === 0) {
      setFormError('Please choose at least one ticket.');
      return;
    }
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
      const customer = { tierId: tier.id, customerName: name.trim(), customerEmail: email.trim() };
      const result = withFares
        ? await createFareBooking({
            ...customer,
            seatIds: reserved ? seatIds : null,
            fares: fares.map((f) => ({ fareId: f.id, quantity: countOf(f) })).filter((f) => f.quantity > 0),
          })
        : reserved
          ? await createSeatBooking({ ...customer, seatIds })
          : await createBooking({ ...customer, quantity });
      setReceipt(result); // "pending": the tickets are held, payment comes next
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

  const ticketCount = reserved
    ? seatIds.length
    : withFares
      ? fares.reduce((n, f) => n + countOf(f), 0)
      : quantity;
  const total = tier.price_cents * ticketCount;
  const totalKzt = fares.reduce((sum, f) => sum + countOf(f) * f.price_kzt, 0);
  const free = withFares ? ticketCount > 0 && totalKzt === 0 : tier.price_cents === 0;
  const totalLabel =
    ticketCount === 0
      ? '—'
      : free
        ? 'Free'
        : withFares
          ? formatKzt(totalKzt)
          : rate
            ? formatKzt(centsToKzt(total, rate))
            : formatPrice(total);

  const setFare = (fare: Fare, value: number) => setFareCounts((prev) => ({ ...prev, [fare.id]: Math.max(0, value) }));
  const canAdd = (fare: Fare) =>
    reserved ? fare.id !== fares[0].id && countOf(fares[0]) > 0 : ticketCount < maxQuantity;

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
        className={`animate-modal-in max-h-[90vh] w-full overflow-y-auto ${reserved ? 'max-w-2xl' : 'max-w-lg'} rounded-3xl bg-cream p-6 text-wine-900 shadow-2xl sm:p-8`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-crimson">{event.title}</p>
            <h2 id="checkout-title" className="mt-1 font-display text-3xl font-bold text-wine-900">
              {tier.cinema ? tier.cinema.name : `${tier.name} tickets`}
            </h2>
            {tier.starts_at && (
              <p className="mt-1 text-sm font-semibold text-wine-900/70">
                {[
                  `${formatEventDate(tier.starts_at)} · ${timeLabel(tier.starts_at)}`,
                  tier.hall,
                  tier.format,
                  tier.language,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
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
            ) : withFares ? null : (
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

            {withFares && (
              <FarePicker
                fares={fares}
                countOf={countOf}
                canAdd={canAdd}
                onChange={setFare}
                seatMode={reserved}
                seatCount={seatIds.length}
                disabled={submitting}
              />
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
                  Total{(reserved || withFares) && ` · ${ticketCount} ${ticketCount === 1 ? (reserved ? 'seat' : 'ticket') : reserved ? 'seats' : 'tickets'}`}
                </span>
                <div className="text-right">
                  <span className="block font-display text-4xl font-bold text-wine-900">
                    {totalLabel}
                  </span>
                  {!free && !withFares && rate && ticketCount > 0 && <span className="text-xs text-wine-900/55">{formatPrice(total)} at 1 $ = {rate} ₸</span>}
                </div>
              </div>
              {!free && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-wine-900/5 p-3 text-xs text-wine-900/70">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Next you pay by card, Kaspi QR or Halyk QR. We hold your {reserved ? 'seats' : 'tickets'} for 10 minutes while you pay.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || ticketCount === 0}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3.5 font-semibold text-cream shadow-sm transition hover:bg-crimson-bright hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
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

interface FarePickerProps {
  fares: Fare[];
  countOf: (fare: Fare) => number;
  canAdd: (fare: Fare) => boolean;
  onChange: (fare: Fare, value: number) => void;
  /** Seat map: the first type fills every seat that has no other type. */
  seatMode: boolean;
  seatCount: number;
  disabled: boolean;
}

function FarePicker({ fares, countOf, canAdd, onChange, seatMode, seatCount, disabled }: FarePickerProps) {
  const stepper =
    'flex h-9 w-9 items-center justify-center rounded-full bg-white text-wine-900 ring-1 ring-wine-900/25 transition hover:bg-crimson hover:text-cream disabled:opacity-35 disabled:hover:bg-white disabled:hover:text-wine-900';
  return (
    <fieldset className="rounded-2xl bg-white/60 p-4 ring-1 ring-wine-900/15">
      <legend className="sr-only">Ticket types</legend>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-wine-900">Ticket types</p>
        <p className="text-xs text-wine-900/60">
          {seatMode
            ? seatCount === 0
              ? 'Choose seats first'
              : `${fares[0].name} by default, change any seat to another type`
            : 'Up to 10 tickets'}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-wine-900/10">
        {fares.map((fare, i) => {
          const count = countOf(fare);
          const auto = seatMode && i === 0;
          return (
            <li key={fare.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-wine-900">
                  {fare.name} <span className="ml-1 font-display font-bold text-crimson">{fare.price_kzt === 0 ? 'Free' : formatKzt(fare.price_kzt)}</span>
                </p>
                {fare.note && <p className="text-xs text-wine-900/60">{fare.note}</p>}
              </div>
              {auto ? (
                <span className="w-24 text-center text-lg font-semibold tabular-nums text-wine-900" aria-live="polite">
                  {count}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={`One ${fare.name} ticket less`} disabled={disabled || count === 0} onClick={() => onChange(fare, count - 1)} className={stepper}>
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-lg font-semibold tabular-nums text-wine-900" aria-live="polite">{count}</span>
                  <button type="button" aria-label={`One ${fare.name} ticket more`} disabled={disabled || !canAdd(fare)} onClick={() => onChange(fare, count + 1)} className={stepper}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
