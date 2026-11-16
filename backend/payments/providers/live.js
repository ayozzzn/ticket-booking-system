// Real acquirer adapter (Kaspi Pay, Halyk / Epay, Freedom Pay, CloudPayments KZ ...).
//
// This project does NOT ship a live integration: it needs a merchant contract, API keys and the
// provider's documentation, and none of those exist yet. Fill in the three methods below.
// Everything else (database, webhook, refund retry, screens) already works with any provider:
//
//   start(payment)   -> create the order at the provider.
//                       Card:  return { kind: 'redirect', url } (provider-hosted page with 3-D Secure,
//                              so card numbers never touch your server).
//                       QR:    return { kind: 'qr', payload, providerRef } (the string the provider gives you).
//   refund(payment)  -> call the provider's refund API, return { ref }.
//   The provider then calls  POST /api/payments/webhook/live  with an HMAC-SHA256 signature
//   (header x-signature, key PAYMENT_WEBHOOK_SECRET) when the customer pays.
//   Adapt payments/routes.js `webhook` if your provider signs requests differently.

export class NotConnectedError extends Error {
  constructor() {
    super('Online payments are not connected yet. Please contact the organiser.');
    this.status = 501;
  }
}

export function createLiveProvider() {
  return {
    name: 'live',
    supports: { card: false, qr: false },
    async start() {
      throw new NotConnectedError();
    },
    async refund() {
      throw new NotConnectedError();
    },
  };
}
