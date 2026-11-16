// Sandbox "bank". It behaves like a Kazakhstan acquirer (card + 3-D Secure SMS code, Kaspi / Halyk QR)
// but moves no real money. Use it for development, demos and tests.
//
// Only the test cards below are accepted. Real card numbers are refused on purpose, so nobody
// ever types real card data into a test system.

import { cardBrand, cvcOk, expiryOk, holderOk, luhnOk, onlyDigits } from '../cards.js';

export const SANDBOX_OTP = '123456';
export const MAX_OTP_ATTEMPTS = 3;

/** number -> what the sandbox bank does with it */
export const TEST_CARDS = {
  '4242424242424242': { outcome: 'success', threeDS: false, label: 'Visa: approved at once' },
  '4111111111111111': { outcome: 'success', threeDS: true, label: 'Visa: approved after the SMS code' },
  '5555555555554444': { outcome: 'success', threeDS: true, label: 'Mastercard: approved after the SMS code' },
  '4000000000000002': { outcome: 'declined', reason: 'The bank declined this card.', label: 'Visa: declined' },
  '4000000000009995': { outcome: 'declined', reason: 'Not enough money on the card.', label: 'Visa: not enough money' },
  '4000000000000069': { outcome: 'declined', reason: 'This card has expired.', label: 'Visa: card expired' },
};

export const publicTestCards = () =>
  Object.entries(TEST_CARDS).map(([number, c]) => ({ number, label: c.label, threeDS: !!c.threeDS }));

export class CardError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function createSandboxProvider() {
  const otpAttempts = new Map(); // paymentId -> wrong codes entered (in memory is fine for a sandbox)

  return {
    name: 'sandbox',
    supports: { card: true, qr: true },

    /** Called after the payment row exists. Returns what the browser needs (QR payload etc.). */
    async start(payment) {
      if (payment.method === 'card') return { kind: 'card' };
      // A real provider returns a deep link / QR string made for this order.
      const payload =
        `kesh-sandbox://pay/${payment.method}/${payment.id}?amount=${payment.amount_kzt}&cur=KZT`;
      return { kind: 'qr', payload, providerRef: `sbx_${payment.id.slice(0, 8)}` };
    },

    /**
     * Validate the card and decide. Returns one of:
     *  { result: 'approved', brand, last4 }
     *  { result: 'requires_3ds', brand, last4 }
     *  { result: 'declined', brand, last4, reason }
     * Throws CardError for typing mistakes (the payment stays open so the customer can fix them).
     */
    async chargeCard(payment, input) {
      const number = onlyDigits(input.number);
      if (!luhnOk(number)) throw new CardError('This card number is not valid. Please check it.');
      if (!expiryOk(input.expMonth, input.expYear)) throw new CardError('This card has expired or the date is wrong.');
      if (!cvcOk(input.cvc)) throw new CardError('The security code (CVC) must have 3 digits.');
      if (!holderOk(input.holder)) throw new CardError('Enter the name as printed on the card (Latin letters).');

      const brand = cardBrand(number);
      const last4 = number.slice(-4);
      const rule = TEST_CARDS[number];
      if (!rule) {
        throw new CardError('Test mode: please use one of the test cards shown on the page. Real cards are not accepted here.');
      }
      if (rule.outcome === 'declined') return { result: 'declined', brand, last4, reason: rule.reason };
      if (rule.threeDS) {
        otpAttempts.set(payment.id, 0);
        return { result: 'requires_3ds', brand, last4 };
      }
      return { result: 'approved', brand, last4, providerRef: `sbx_card_${payment.id.slice(0, 8)}` };
    },

    /** Check the SMS code of 3-D Secure. */
    async verifyOtp(payment, code) {
      const used = otpAttempts.get(payment.id) ?? 0;
      if (String(code ?? '').trim() === SANDBOX_OTP) {
        otpAttempts.delete(payment.id);
        return { result: 'approved', providerRef: `sbx_3ds_${payment.id.slice(0, 8)}` };
      }
      const left = MAX_OTP_ATTEMPTS - used - 1;
      if (left <= 0) {
        otpAttempts.delete(payment.id);
        return { result: 'declined', reason: 'Too many wrong SMS codes. Please try again.' };
      }
      otpAttempts.set(payment.id, used + 1);
      return { result: 'wrong_code', attemptsLeft: left };
    },

    /** The customer approves or declines in the (simulated) banking app. */
    async qrDecision(_payment, action) {
      if (action === 'approve') return { result: 'approved', providerRef: `sbx_qr_${_payment.id.slice(0, 8)}` };
      return { result: 'declined', reason: 'The payment was declined in the banking app.' };
    },

    async refund(payment) {
      return { ref: `sbx_refund_${payment.id.slice(0, 8)}` };
    },
  };
}
