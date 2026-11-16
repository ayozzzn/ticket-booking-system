import { apiRequest } from '@/lib/apiClient';
import type { BookingReceipt, PaymentInfo, PaymentMethod } from '@/types/ticketing';

export interface PaymentConfig {
  mode: 'sandbox' | 'live';
  currency: 'KZT';
  /** For "about 22 500 ₸" estimates before booking. The real amount is fixed when the booking is created. */
  kztPerUsd: number | null;
  methods: PaymentMethod[];
  /** Sandbox only */
  testCards?: { number: string; label: string; threeDS: boolean }[];
  testOtp?: string;
}

/** What the browser needs to continue after the server answered. */
export interface PaymentState {
  payment: PaymentInfo;
  receipt: BookingReceipt;
  /** Sent when a payment is started. For QR: the text to put into the QR code. */
  action?: { kind: 'card' } | { kind: 'qr'; payload: string };
  /** After card / 3-D Secure / QR decision: what the screen should do next. */
  next?: 'done' | '3ds' | 'failed';
}

export interface Owner {
  code: string;
  email: string;
}

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  holder: string;
}

export const fetchPaymentConfig = () => apiRequest<PaymentConfig>('/api/payments/config');

export const startPayment = (owner: Owner, method: PaymentMethod) =>
  apiRequest<PaymentState>('/api/payments', { method: 'POST', body: JSON.stringify({ ...owner, method }) });

export const submitCard = (id: string, owner: Owner, card: CardInput) =>
  apiRequest<PaymentState>(`/api/payments/${id}/card`, { method: 'POST', body: JSON.stringify({ ...owner, card }) });

export const submitOtp = (id: string, owner: Owner, otp: string) =>
  apiRequest<PaymentState>(`/api/payments/${id}/3ds`, { method: 'POST', body: JSON.stringify({ ...owner, otp }) });

/** Test mode only: act as the customer's banking app. */
export const decideInBankApp = (id: string, owner: Owner, action: 'approve' | 'decline') =>
  apiRequest<PaymentState>(`/api/payments/${id}/sandbox/qr`, { method: 'POST', body: JSON.stringify({ ...owner, action }) });

export const fetchPaymentStatus = (id: string, owner: Owner) =>
  apiRequest<PaymentState>(`/api/payments/${id}/status`, { method: 'POST', body: JSON.stringify(owner) });
