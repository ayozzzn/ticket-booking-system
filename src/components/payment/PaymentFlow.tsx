import { AlertCircle, CreditCard, Loader2, QrCode as QrIcon, ShieldCheck, TimerOff, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import CardPayment from '@/components/payment/CardPayment';
import HoldTimer from '@/components/payment/HoldTimer';
import PaymentSuccess from '@/components/payment/PaymentSuccess';
import QrPayment from '@/components/payment/QrPayment';
import { useSession } from '@/hooks/useSession';
import { cancelBooking } from '@/lib/bookingApi';
import { formatKzt } from '@/lib/format';
import { fetchPaymentConfig, startPayment, type PaymentConfig, type PaymentState } from '@/lib/paymentApi';
import { describeFares, sessionLabel } from '@/lib/sessions';
import type { BookingReceipt, PaymentMethod } from '@/types/ticketing';

interface PaymentFlowProps {
  /** A booking that is waiting for payment (status "pending"). */
  receipt: BookingReceipt;
  /** Called as soon as the money is confirmed, so lists can refresh behind the dialog. */
  onPaid: (receipt: BookingReceipt) => void;
  /** The reservation ran out or the customer gave it up. */
  onExpired: () => void;
  /** The customer pressed "Done" on the success screen. */
  onDone: () => void;
}

const METHOD_TABS: { id: PaymentMethod; label: string; hint: string; accent?: string }[] = [
  { id: 'card', label: 'Bank card', hint: 'Visa, Mastercard' },
  { id: 'kaspi_qr', label: 'Kaspi QR', hint: 'In the Kaspi.kz app', accent: '#f14635' },
  { id: 'halyk_qr', label: 'Halyk QR', hint: 'In Halyk Homebank', accent: '#00a651' },
];

export default function PaymentFlow({ receipt: initial, onPaid, onExpired, onDone }: PaymentFlowProps) {
  const { session } = useSession();
  const [receipt, setReceipt] = useState(initial);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [current, setCurrent] = useState<PaymentState | null>(null);
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState('');
  const [failure, setFailure] = useState('');
  // Free tickets arrive already confirmed: go straight to the ticket.
  const [paid, setPaid] = useState<BookingReceipt | null>(initial.status === 'confirmed' ? initial : null);
  const [expired, setExpired] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [givingUp, setGivingUp] = useState(false);
  const requestId = useRef(0);
  const paidRef = useRef(initial.status === 'confirmed');

  const owner = { code: receipt.booking_code, email: receipt.customer_email };
  const total = receipt.total_kzt ?? 0;

  useEffect(() => {
    fetchPaymentConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  /** Ask the server for a fresh payment (it cancels the one in progress). */
  const begin = useCallback(async (m: PaymentMethod) => {
    const id = ++requestId.current;
    setStarting(true);
    setStartError('');
    try {
      const state = await startPayment({ code: initial.booking_code, email: initial.customer_email }, m);
      if (id !== requestId.current) return; // the customer already picked another method
      setCurrent(state);
      setReceipt(state.receipt);
    } catch (err) {
      if (id !== requestId.current) return;
      setCurrent(null);
      setStartError(err instanceof Error ? err.message : 'We could not start the payment.');
    } finally {
      if (id === requestId.current) setStarting(false);
    }
  }, [initial.booking_code, initial.customer_email]);

  useEffect(() => {
    if (!paidRef.current) void begin(method);
  }, [method, begin]);

  function choose(m: PaymentMethod) {
    if (m === method || paid) return;
    setFailure('');
    setCurrent(null);
    setMethod(m);
  }

  function handlePaid(done: BookingReceipt) {
    if (paidRef.current) return;
    paidRef.current = true;
    requestId.current++; // ignore anything still in flight
    setPaid(done);
    onPaid(done);
  }

  function handleFailed(reason: string) {
    setFailure(reason);
    void begin(method); // a fresh payment, so the customer can try again at once
  }

  const handleExpire = useCallback(() => {
    if (!paidRef.current) setExpired(true);
  }, []);

  async function giveUp() {
    setGivingUp(true);
    try {
      await cancelBooking(owner.code, owner.email);
    } catch {
      /* it may already be expired, that is fine */
    }
    onExpired();
  }

  // ---- screens -------------------------------------------------------------------------
  if (paid) return <PaymentSuccess receipt={paid} loggedIn={!!session} onDone={onDone} />;

  if (expired) {
    return (
      <div className="animate-fade-up space-y-5 py-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-700">
          <TimerOff className="h-8 w-8" aria-hidden="true" />
        </span>
        <h3 className="font-display text-3xl font-bold text-wine-900">Time is up</h3>
        <p className="mx-auto max-w-sm text-sm text-wine-900/70">
          The tickets were released so other people can buy them. No money was taken. You can choose your tickets again.
        </p>
        <button type="button" onClick={onExpired} className="rounded-full bg-crimson px-8 py-3 font-semibold text-cream transition hover:bg-crimson-bright">
          Back to tickets
        </button>
      </div>
    );
  }

  const activeTab = METHOD_TABS.find((t) => t.id === method)!;
  const available = (id: PaymentMethod) => !config || config.methods.includes(id);

  return (
    <div className="space-y-5">
      {/* Order summary */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-wine-900 to-wine-800 p-5 text-cream">
        <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-gold/15" />
        <div className="relative flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-cream/60">Order {receipt.booking_code}</p>
            <p className="mt-1 truncate font-medium">{receipt.event_title}</p>
            <p className="text-sm text-cream/70">{describeFares(receipt) ?? `${receipt.quantity} × ${receipt.tier_name}`}</p>
          </div>
          <p className="shrink-0 font-display text-4xl font-bold text-gold">{formatKzt(total)}</p>
        </div>
      </div>

      <HoldTimer holdExpiresAt={receipt.hold_expires_at} onExpire={handleExpire} />

      {/* Method tabs */}
      <div role="tablist" aria-label="Payment method" className="grid grid-cols-3 gap-2 rounded-2xl bg-wine-900/5 p-1.5">
        {METHOD_TABS.map((tab) => {
          const active = tab.id === method;
          const ok = available(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={!ok}
              onClick={() => choose(tab.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? 'bg-crimson text-cream shadow-md' : 'text-wine-900/75 hover:bg-white/70'
              }`}
            >
              {tab.id === 'card' ? <CreditCard className="h-5 w-5" aria-hidden="true" /> : (
                <span className="relative">
                  <QrIcon className="h-5 w-5" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-white/70" style={{ backgroundColor: tab.accent }} />
                </span>
              )}
              <span className="text-sm font-semibold">{tab.label}</span>
              <span className={`hidden text-[10px] sm:block ${active ? 'text-cream/75' : 'text-wine-900/50'}`}>{tab.hint}</span>
            </button>
          );
        })}
      </div>

      {config?.mode === 'sandbox' && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Test mode: no real money moves. Nothing you type here is charged.
        </p>
      )}

      {failure && (
        <div role="alert" className="animate-fade-up flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><strong className="font-semibold">Payment not completed.</strong> {failure} You can try again.</span>
        </div>
      )}

      {/* Panel */}
      <div key={`${method}-${current?.payment.id ?? 'x'}`} className="animate-fade-up">
        {startError ? (
          <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{startError}</p>
            <button type="button" onClick={() => void begin(method)} className="rounded-full bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800">
              Try again
            </button>
          </div>
        ) : !current ? (
          <div className="flex items-center justify-center gap-3 py-16 text-wine-900/70" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Preparing {activeTab.label}...
          </div>
        ) : method === 'card' ? (
          <CardPayment
            payment={current.payment}
            owner={owner}
            config={config}
            disabled={starting}
            previousFailure={failure}
            onPaid={handlePaid}
            onDeclined={handleFailed}
          />
        ) : current.action?.kind === 'qr' ? (
          <QrPayment
            payment={current.payment}
            owner={owner}
            payload={current.action.payload}
            config={config}
            onPaid={handlePaid}
            onFailed={handleFailed}
          />
        ) : null}
      </div>

      {/* Footer */}
      <div className="border-t border-wine-900/10 pt-4 text-center text-xs text-wine-900/60">
        <p>You can close this window. Your tickets stay reserved until the timer ends. Find them under “Find my booking”{session ? ' or in your profile' : ''}.</p>
        {confirmGiveUp ? (
          <p className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="text-wine-900/80">Release the tickets now?</span>
            <button type="button" onClick={giveUp} disabled={givingUp} className="rounded-full bg-red-600 px-4 py-1.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {givingUp ? 'Releasing...' : 'Yes, release'}
            </button>
            <button type="button" onClick={() => setConfirmGiveUp(false)} disabled={givingUp} className="font-medium text-crimson underline">
              Keep them
            </button>
          </p>
        ) : (
          <button type="button" onClick={() => setConfirmGiveUp(true)} className="mt-2 inline-flex items-center gap-1.5 font-medium text-crimson underline">
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel this reservation
          </button>
        )}
      </div>
    </div>
  );
}
