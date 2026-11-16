import { AlertCircle, Check, Loader2, ScanLine, Smartphone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import QrCode from '@/components/payment/QrCode';
import { formatKzt } from '@/lib/format';
import { decideInBankApp, fetchPaymentStatus, type Owner, type PaymentConfig } from '@/lib/paymentApi';
import type { BookingReceipt, PaymentInfo } from '@/types/ticketing';

interface QrPaymentProps {
  payment: PaymentInfo;
  owner: Owner;
  /** The text inside the QR code (comes from the server) */
  payload: string;
  config: PaymentConfig | null;
  onPaid: (receipt: BookingReceipt) => void;
  onFailed: (reason: string) => void;
}

const BANKS = {
  kaspi_qr: {
    name: 'Kaspi.kz',
    app: 'Kaspi.kz app',
    accent: '#f14635',
    steps: ['Open the Kaspi.kz app', 'Tap “Scan QR” on the main screen', 'Check the amount and confirm with Kaspi Gold'],
  },
  halyk_qr: {
    name: 'Halyk',
    app: 'Halyk Homebank app',
    accent: '#00a651',
    steps: ['Open the Halyk Homebank app', 'Tap “Pay by QR”', 'Point the camera here and confirm the payment'],
  },
} as const;

const POLL_MS = 3000;

export default function QrPayment({ payment, owner, payload, config, onPaid, onFailed }: QrPaymentProps) {
  const bank = BANKS[payment.method === 'halyk_qr' ? 'halyk_qr' : 'kaspi_qr'];
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const finished = useRef(false);

  // Ask the server every few seconds whether the money arrived. This is also how a real bank payment is noticed.
  useEffect(() => {
    finished.current = false;
    let stopped = false;
    const check = async () => {
      try {
        const state = await fetchPaymentStatus(payment.id, owner);
        if (stopped || finished.current) return;
        setCheckedAt(Date.now());
        if (state.payment.status === 'paid') {
          finished.current = true;
          onPaid(state.receipt);
        } else if (state.payment.status === 'failed') {
          finished.current = true;
          onFailed(state.payment.failure_reason ?? 'The payment was not completed.');
        }
      } catch {
        /* a short network problem: the next check will try again */
      }
    };
    const id = window.setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.id, owner.code, owner.email]);

  async function decide(action: 'approve' | 'decline') {
    setBusy(action);
    setError('');
    try {
      const result = await decideInBankApp(payment.id, owner, action);
      finished.current = true;
      if (result.next === 'done') onPaid(result.receipt);
      else onFailed(result.payment.failure_reason ?? 'The payment was declined in the banking app.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-6">
        {/* QR with scanner animation */}
        <div className="mx-auto w-full max-w-[250px]">
          <div className="relative rounded-3xl bg-white p-4 shadow-xl shadow-wine-900/20 ring-1 ring-wine-900/10">
            {(['left-2 top-2 border-l-4 border-t-4 rounded-tl-xl', 'right-2 top-2 border-r-4 border-t-4 rounded-tr-xl', 'bottom-2 left-2 border-b-4 border-l-4 rounded-bl-xl', 'bottom-2 right-2 border-b-4 border-r-4 rounded-br-xl'] as const).map((c) => (
              <span key={c} className={`absolute h-6 w-6 border-crimson ${c}`} aria-hidden="true" />
            ))}
            <div className="relative overflow-hidden rounded-xl">
              <QrCode text={payload} size={220} label={`${bank.name} payment QR code`} className="h-auto w-full" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden="true">
                <span className="block h-[3px] w-full animate-scan bg-gradient-to-r from-transparent via-crimson to-transparent shadow-[0_0_14px_3px_rgba(196,42,60,0.55)]" />
              </span>
            </div>
          </div>
          <p className="mt-3 text-center font-display text-3xl font-semibold text-wine-900">{formatKzt(payment.amount_kzt)}</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-xs text-wine-900/60" role="status">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-crimson opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-crimson" />
            </span>
            Waiting for payment{checkedAt ? '...' : ''}
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-display text-2xl font-semibold text-wine-900">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: bank.accent }} aria-hidden="true" />
            Pay with {bank.name} QR
          </h3>
          <ol className="space-y-2.5">
            {bank.steps.map((text, i) => (
              <li key={text} className="flex items-start gap-3 text-sm text-wine-900/80">
                <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-crimson text-xs font-semibold text-cream">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
          <p className="flex items-start gap-2 rounded-xl bg-wine-900/5 p-3 text-xs text-wine-900/70">
            <ScanLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            This page updates by itself. You do not need to press anything after you pay.
          </p>

          {config?.mode === 'sandbox' && (
            <button
              type="button"
              onClick={() => setPhoneOpen((v) => !v)}
              aria-expanded={phoneOpen}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
            >
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              {phoneOpen ? 'Hide the test phone' : 'Test mode: scan with a test phone'}
            </button>
          )}
        </div>
      </div>

      {phoneOpen && config?.mode === 'sandbox' && (
        <div className="animate-slide-in-right mx-auto w-full max-w-[260px]">
          <div className="rounded-[2.2rem] bg-wine-950 p-2.5 shadow-2xl shadow-black/40 ring-1 ring-gold/30">
            <div className="overflow-hidden rounded-[1.7rem] bg-cream text-wine-900">
              <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[10px] font-semibold text-wine-900/60">
                <span>9:41</span>
                <span className="h-1.5 w-10 rounded-full bg-wine-900/20" />
                <span>5G</span>
              </div>
              <div className="px-5 py-3 text-white" style={{ backgroundColor: bank.accent }}>
                <p className="text-[10px] uppercase tracking-widest text-white/70">Simulated app</p>
                <p className="font-semibold">{bank.app}</p>
              </div>
              <div className="space-y-3 px-5 py-4 text-center">
                <p className="text-xs text-wine-900/60">Pay to</p>
                <p className="font-display text-2xl font-semibold">Kesh Tickets</p>
                <p className="font-display text-4xl font-semibold text-crimson">{formatKzt(payment.amount_kzt)}</p>
                <p className="text-[11px] text-wine-900/55">From: Gold card •••• 7788</p>

                {error && (
                  <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-2 text-left text-xs text-red-800">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => decide('approve')}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
                  style={{ backgroundColor: bank.accent }}
                >
                  {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  {busy === 'approve' ? 'Paying...' : 'Pay'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => decide('decline')}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-xs font-medium text-wine-900/70 transition hover:bg-wine-900/10 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
