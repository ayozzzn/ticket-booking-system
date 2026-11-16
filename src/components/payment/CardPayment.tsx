import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Lock, MessageSquareText, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import CardPreview from '@/components/payment/CardPreview';
import {
  cardBrand, expiryValid, formatCardNumber, formatExpiry, luhnOk, onlyDigits, parseExpiry,
} from '@/lib/cardUtils';
import { formatKzt } from '@/lib/format';
import { submitCard, submitOtp, type Owner, type PaymentConfig } from '@/lib/paymentApi';
import type { BookingReceipt, PaymentInfo } from '@/types/ticketing';

interface CardPaymentProps {
  payment: PaymentInfo;
  owner: Owner;
  config: PaymentConfig | null;
  /** The parent is creating a fresh payment, so the form must wait. */
  disabled: boolean;
  /** Message from the previous attempt (the parent already made a fresh payment). */
  previousFailure: string;
  onPaid: (receipt: BookingReceipt) => void;
  /** The bank said no: the parent creates a new payment and gives it back through `payment`. */
  onDeclined: (reason: string) => void;
}

const inputBase =
  'w-full rounded-xl border bg-white px-4 py-3 font-mono text-base tracking-wider text-wine-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-wine-900/35 transition focus:outline-none focus:ring-4 disabled:opacity-60';
const okRing = 'border-wine-900/25 focus:border-crimson focus:ring-crimson/15';
const badRing = 'border-red-400 focus:border-red-500 focus:ring-red-500/15';

export default function CardPayment({ payment, owner, config, disabled, previousFailure, onPaid, onDeclined }: CardPaymentProps) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [holder, setHolder] = useState('');
  const [focus, setFocus] = useState<'number' | 'expiry' | 'cvc' | 'holder' | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | '3ds'>('form');
  const [shakeKey, setShakeKey] = useState(0);
  const [showTest, setShowTest] = useState(false);

  // A new payment id means a new attempt: go back to the form.
  useEffect(() => {
    setStep('form');
  }, [payment.id]);

  useEffect(() => {
    // The flow already shows the bank's message above the form; here the card only shakes.
    if (previousFailure) setShakeKey((k) => k + 1);
  }, [previousFailure]);

  const digits = onlyDigits(number);
  const brand = cardBrand(digits);
  const problems = {
    number: digits.length < 13 || !luhnOk(digits) ? 'Check the card number.' : '',
    expiry: !expiryValid(expiry) ? 'Use the date on the card, as MM/YY.' : '',
    cvc: !/^\d{3}$/.test(cvc) ? '3 digits.' : '',
    holder: !/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(holder.trim()) ? 'Name as on the card, Latin letters.' : '',
  };
  const formOk = !problems.number && !problems.expiry && !problems.cvc && !problems.holder;
  const showProblem = (k: keyof typeof problems) => (touched[k] ? problems[k] : '');
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  function fillTestCard(n: string) {
    setNumber(formatCardNumber(n));
    setExpiry('12/30');
    setCvc('123');
    setHolder('ALEX MORGAN');
    setTouched({});
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ number: true, expiry: true, cvc: true, holder: true });
    if (!formOk || submitting || disabled) return;
    const exp = parseExpiry(expiry);
    if (!exp) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await submitCard(payment.id, owner, {
        number: digits, expMonth: exp.month, expYear: exp.year, cvc, holder: holder.trim(),
      });
      if (result.next === 'done') onPaid(result.receipt);
      else if (result.next === '3ds') setStep('3ds');
      else onDeclined(result.payment.failure_reason ?? 'The bank declined this card.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not process the card.');
      setShakeKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === '3ds') {
    return (
      <OtpStep
        payment={payment}
        owner={owner}
        last4={digits.slice(-4)}
        testOtp={config?.mode === 'sandbox' ? config.testOtp : undefined}
        onPaid={onPaid}
        onDeclined={onDeclined}
        onBack={() => setStep('form')}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div key={shakeKey}>
        <CardPreview number={number} holder={holder.toUpperCase()} expiry={expiry} cvc={cvc} flipped={focus === 'cvc'} shake={shakeKey > 0 && !!error} />
      </div>

      {config?.mode === 'sandbox' && config.testCards && (
        <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <button
            type="button"
            onClick={() => setShowTest((v) => !v)}
            aria-expanded={showTest}
            className="flex w-full items-center justify-between gap-2 text-left font-medium"
          >
            <span>Test mode: {config.testCards.length} test cards, tap to {showTest ? 'hide' : 'show'}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition ${showTest ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showTest && (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {config.testCards.map((c) => (
                <li key={c.number}>
                  <button
                    type="button"
                    onClick={() => fillTestCard(c.number)}
                    className="w-full rounded-xl bg-white/80 px-3 py-2 text-left text-xs ring-1 ring-amber-200 transition hover:bg-white hover:ring-amber-400"
                  >
                    <span className="block font-mono tracking-wider">{formatCardNumber(c.number)}</span>
                    <span className="text-amber-900/80">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-amber-900/70">Real cards are not accepted in test mode.</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="card-number" className="mb-1.5 block text-sm font-medium text-wine-900">Card number</label>
          <div className="relative">
            <input
              id="card-number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={number}
              disabled={submitting || disabled}
              onChange={(e) => setNumber(formatCardNumber(e.target.value))}
              onFocus={() => setFocus('number')}
              onBlur={() => { setFocus(null); touch('number'); }}
              aria-invalid={!!showProblem('number')}
              className={`${inputBase} pr-12 ${showProblem('number') ? badRing : okRing}`}
            />
            {digits.length >= 13 && luhnOk(digits) && (
              <CheckCircle2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-fade-up text-emerald-600" aria-label="Valid card number" />
            )}
          </div>
          {showProblem('number') && <p className="mt-1 text-xs text-red-700">{showProblem('number')}</p>}
          {brand !== 'card' && !showProblem('number') && (
            <p className="mt-1 text-xs text-wine-900/60">{brand === 'visa' ? 'Visa' : 'Mastercard'} detected</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="card-expiry" className="mb-1.5 block text-sm font-medium text-wine-900">Expires</label>
            <input
              id="card-expiry"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={expiry}
              disabled={submitting || disabled}
              onChange={(e) => setExpiry(formatExpiry(e.target.value, expiry))}
              onFocus={() => setFocus('expiry')}
              onBlur={() => { setFocus(null); touch('expiry'); }}
              aria-invalid={!!showProblem('expiry')}
              className={`${inputBase} ${showProblem('expiry') ? badRing : okRing}`}
            />
            {showProblem('expiry') && <p className="mt-1 text-xs text-red-700">{showProblem('expiry')}</p>}
          </div>
          <div>
            <label htmlFor="card-cvc" className="mb-1.5 block text-sm font-medium text-wine-900">CVC</label>
            <input
              id="card-cvc"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              type="password"
              maxLength={3}
              value={cvc}
              disabled={submitting || disabled}
              onChange={(e) => setCvc(onlyDigits(e.target.value).slice(0, 3))}
              onFocus={() => setFocus('cvc')}
              onBlur={() => { setFocus(null); touch('cvc'); }}
              aria-invalid={!!showProblem('cvc')}
              className={`${inputBase} ${showProblem('cvc') ? badRing : okRing}`}
            />
            {showProblem('cvc') && <p className="mt-1 text-xs text-red-700">{showProblem('cvc')}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="card-holder" className="mb-1.5 block text-sm font-medium text-wine-900">Name on card</label>
          <input
            id="card-holder"
            autoComplete="cc-name"
            placeholder="ALEX MORGAN"
            value={holder}
            disabled={submitting || disabled}
            onChange={(e) => setHolder(e.target.value.toUpperCase().slice(0, 60))}
            onFocus={() => setFocus('holder')}
            onBlur={() => { setFocus(null); touch('holder'); }}
            aria-invalid={!!showProblem('holder')}
            className={`${inputBase} uppercase ${showProblem('holder') ? badRing : okRing}`}
          />
          {showProblem('holder') && <p className="mt-1 text-xs text-red-700">{showProblem('holder')}</p>}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || disabled}
        className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-crimson py-3.5 font-semibold text-cream shadow-sm transition hover:bg-crimson-bright hover:shadow-md disabled:cursor-wait disabled:opacity-70"
      >
        {submitting || disabled ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
        {submitting ? 'Contacting your bank...' : `Pay ${formatKzt(payment.amount_kzt)}`}
      </button>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-wine-900/60">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Protected by 3-D Secure. We only keep the last 4 digits of your card.
      </p>
    </form>
  );
}

// ---- 3-D Secure (SMS code from the bank) --------------------------------------------------

interface OtpStepProps {
  payment: PaymentInfo;
  owner: Owner;
  last4: string;
  testOtp?: string;
  onPaid: (receipt: BookingReceipt) => void;
  onDeclined: (reason: string) => void;
  onBack: () => void;
}

function OtpStep({ payment, owner, last4, testOtp, onPaid, onDeclined, onBack }: OtpStepProps) {
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  async function verify(full: string) {
    setSubmitting(true);
    setError('');
    try {
      const result = await submitOtp(payment.id, owner, full);
      if (result.next === 'done') onPaid(result.receipt);
      else onDeclined(result.payment.failure_reason ?? 'The payment was declined.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not check the code.');
      setCode(['', '', '', '', '', '']);
      setShakeKey((k) => k + 1);
      window.setTimeout(() => refs.current[0]?.focus(), 50);
    } finally {
      setSubmitting(false);
    }
  }

  function setDigit(i: number, value: string) {
    const d = onlyDigits(value);
    if (!d) return;
    const next = [...code];
    d.slice(0, 6 - i).split('').forEach((ch, k) => (next[i + k] = ch));
    setCode(next);
    const nextIndex = Math.min(i + d.length, 5);
    refs.current[nextIndex]?.focus();
    if (next.every(Boolean)) void verify(next.join(''));
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...code];
      if (next[i]) next[i] = '';
      else if (i > 0) {
        next[i - 1] = '';
        refs.current[i - 1]?.focus();
      }
      setCode(next);
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    setDigit(0, e.clipboardData.getData('text'));
  }

  return (
    <div className="animate-slide-in-right space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-crimson/10 text-crimson ring-1 ring-crimson/20">
        <MessageSquareText className="h-8 w-8" aria-hidden="true" />
      </div>
      <div>
        <h3 className="font-display text-3xl font-bold text-wine-900">Confirm with your bank</h3>
        <p className="mt-2 text-sm text-wine-900/70">
          We asked your bank to send an SMS code for the card ending <span className="font-mono font-semibold">{last4}</span>.
          Enter the 6 digits below.
        </p>
      </div>

      <div key={shakeKey} className={`flex justify-center gap-2 sm:gap-3 ${shakeKey > 0 ? 'animate-shake' : ''}`}>
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={digit}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1} of 6`}
            maxLength={6}
            disabled={submitting}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className={`h-14 w-11 rounded-xl border bg-white text-center font-mono text-2xl font-semibold text-wine-900 transition focus:outline-none focus:ring-4 disabled:opacity-60 sm:w-12 ${
              error ? badRing : digit ? 'border-crimson/60 focus:border-crimson focus:ring-crimson/15' : okRing
            }`}
          />
        ))}
      </div>

      {submitting && (
        <p className="flex items-center justify-center gap-2 text-sm text-wine-900/70" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking the code...
        </p>
      )}
      {error && (
        <div role="alert" className="mx-auto flex max-w-sm items-start gap-3 rounded-xl bg-red-50 p-3 text-left text-sm text-red-800 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {testOtp && (
        <button
          type="button"
          onClick={() => setDigit(0, testOtp)}
          disabled={submitting}
          className="mx-auto block rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-950 ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          Test mode: the code is <span className="font-mono font-semibold tracking-widest">{testOtp}</span> (tap to fill)
        </button>
      )}

      <div className="flex items-center justify-center gap-4 text-sm text-wine-900/70">
        <button type="button" onClick={onBack} disabled={submitting} className="font-medium text-crimson underline disabled:opacity-50">
          Change card
        </button>
      </div>
    </div>
  );
}
