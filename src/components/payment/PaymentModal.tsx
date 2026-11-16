import { Lock, X } from 'lucide-react';
import { useEffect } from 'react';
import PaymentFlow from '@/components/payment/PaymentFlow';
import type { BookingReceipt } from '@/types/ticketing';

interface PaymentModalProps {
  /** A pending booking (tickets held, waiting for money). */
  receipt: BookingReceipt;
  onClose: () => void;
  /** The money was confirmed (the dialog stays open to show the ticket). */
  onPaid: (receipt: BookingReceipt) => void;
  /** The reservation ended without payment. */
  onExpired: () => void;
}

/** Dialog around the payment flow. Used right after "Confirm" and from "Pay now" on a pending booking. */
export default function PaymentModal({ receipt, onClose, onPaid, onExpired }: PaymentModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-wine-950/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="animate-modal-in relative my-4 w-full max-w-xl rounded-3xl bg-cream p-5 text-wine-900 shadow-2xl sm:my-8 sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-crimson">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Secure payment · KZT
            </p>
            <h2 id="payment-title" className="mt-1 font-display text-3xl font-bold text-wine-900">Checkout</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-wine-900/60 transition hover:bg-wine-900/10 hover:text-wine-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <PaymentFlow receipt={receipt} onPaid={onPaid} onExpired={onExpired} onDone={onClose} />
      </div>
    </div>
  );
}
