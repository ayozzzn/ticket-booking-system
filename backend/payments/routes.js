import crypto from 'node:crypto';
import { CardError, createSandboxProvider, publicTestCards, SANDBOX_OTP } from './providers/sandbox.js';
import { createLiveProvider } from './providers/live.js';

const METHODS = ['card', 'kaspi_qr', 'halyk_qr'];
const QR_METHODS = ['kaspi_qr', 'halyk_qr'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Turn a Supabase error into something safe to show. Our own RAISE EXCEPTION texts are user-friendly. */
function dbError(error) {
  if (error?.code === 'P0001') return new HttpError(400, error.message); // RAISE EXCEPTION from our SQL
  if (error?.code === '42501') return new HttpError(403, 'Not allowed.');
  console.error('Payment database error:', error?.code, error?.message);
  return new HttpError(400, 'Request failed. Check input or permissions.');
}

/**
 * Registers all payment routes.
 * deps = { db, secret, mode: 'sandbox' | 'live', webhookSecret, limited }
 * Returns { settleRefund, startBackgroundJobs } so server.js can finish refunds after a cancellation.
 */
export function registerPaymentRoutes(app, deps) {
  const { db, secret, mode, webhookSecret, limited } = deps;
  const provider = deps.provider ?? (mode === 'live' ? createLiveProvider() : createSandboxProvider());
  const sandbox = mode !== 'live';

  async function call(name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw dbError(error);
    return data;
  }

  // ---- small helpers ---------------------------------------------------------------
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch((err) => {
      if (err instanceof HttpError || err instanceof CardError || err?.status) {
        return res.status(err.status || 400).json({ error: err.message });
      }
      return next(err);
    });

  function readOwner(body) {
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!code || code.length > 60 || !EMAIL.test(email) || email.length > 254) {
      throw new HttpError(400, 'Invalid booking code or email.');
    }
    return { code, email };
  }

  function readPaymentId(req) {
    if (!UUID.test(req.params.id)) throw new HttpError(400, 'Invalid payment ID.');
    return req.params.id;
  }

  /** Load a payment and make sure it belongs to the booking code + email the caller proved. */
  async function loadOwned(paymentId, { code, email }) {
    const p = await call('backend_get_payment', { p_payment_id: paymentId, p_secret: secret });
    if (!p || p.booking_code !== code || p.customer_email !== email) {
      throw new HttpError(404, 'Payment not found.');
    }
    return p;
  }

  const confirm = async (payment, providerRef) => {
    const receipt = await call('confirm_payment', {
      p_payment_id: payment.id,
      p_provider_ref: providerRef ?? null,
      p_amount_kzt: payment.amount_kzt,
      p_secret: secret,
    });
    return settleRefund(receipt); // a late payment may need to be sent straight back
  };

  const fail = (payment, reason) =>
    call('update_payment', {
      p_payment_id: payment.id, p_status: 'failed', p_card_brand: null, p_card_last4: null,
      p_reason: reason, p_provider_ref: null, p_secret: secret,
    });

  async function snapshot(paymentId, { code, email }, extra = {}) {
    const state = await call('get_payment_status', { p_payment_id: paymentId, p_code: code, p_email: email });
    if (!state) throw new HttpError(404, 'Payment not found.');
    return { ...state, ...extra };
  }

  /** If a refund is waiting, ask the provider to pay it and mark it done. Never throws. */
  async function settleRefund(receipt) {
    const pay = receipt?.payment;
    if (!pay || pay.refund_status !== 'pending' || !(pay.refund_kzt > 0)) return receipt;
    try {
      const { ref } = await provider.refund({ id: pay.id, amount_kzt: pay.refund_kzt, method: pay.method });
      return await call('complete_refund', { p_payment_id: pay.id, p_refund_ref: ref ?? null, p_secret: secret });
    } catch (err) {
      // The refund stays 'pending'. The background job below tries again every minute.
      console.error('Refund will be retried later:', err?.message);
      return receipt;
    }
  }

  // ---- routes ----------------------------------------------------------------------
  app.get('/api/payments/config', wrap(async (_req, res) => {
    const { data: rate } = await db.rpc('get_exchange_rate'); // only used to show "about 22 500 KZT" early
    res.json({
      mode: sandbox ? 'sandbox' : 'live',
      currency: 'KZT',
      kztPerUsd: typeof rate === 'number' ? rate : Number(rate) || null,
      methods: METHODS.filter((m) => (m === 'card' ? provider.supports.card : provider.supports.qr)),
      ...(sandbox ? { testCards: publicTestCards(), testOtp: SANDBOX_OTP } : {}),
    });
  }));

  // 1. Start (or restart) a payment for a pending booking.
  app.post('/api/payments', limited, wrap(async (req, res) => {
    const owner = readOwner(req.body);
    const method = req.body?.method;
    if (!METHODS.includes(method)) throw new HttpError(400, 'Choose a payment method.');
    const supported = method === 'card' ? provider.supports.card : provider.supports.qr;
    if (!supported) throw new HttpError(501, 'Online payments are not connected yet. Please contact the organiser.');

    const payment = await call('create_payment', {
      p_code: owner.code, p_email: owner.email, p_method: method, p_secret: secret,
    });
    const started = await provider.start(payment);
    if (started.providerRef) {
      await call('update_payment', {
        p_payment_id: payment.id, p_status: 'awaiting', p_card_brand: null, p_card_last4: null,
        p_reason: null, p_provider_ref: started.providerRef, p_secret: secret,
      });
    }
    const { providerRef: _hidden, ...action } = started;
    res.status(201).json(await snapshot(payment.id, owner, { action }));
  }));

  // 2. Card details (sandbox only; live cards are entered on the provider's own page).
  app.post('/api/payments/:id/card', limited, wrap(async (req, res) => {
    if (!sandbox) throw new HttpError(404, 'Not found.');
    const owner = readOwner(req.body);
    const id = readPaymentId(req);
    const payment = await loadOwned(id, owner);
    if (payment.method !== 'card') throw new HttpError(409, 'This payment is not a card payment.');
    if (payment.status !== 'awaiting') throw new HttpError(409, 'This payment is already in progress. Start a new one.');

    const outcome = await provider.chargeCard(payment, req.body?.card ?? {}); // may throw CardError
    const keep = { p_card_brand: outcome.brand, p_card_last4: outcome.last4, p_reason: null, p_provider_ref: null, p_secret: secret };

    if (outcome.result === 'declined') {
      await call('update_payment', { p_payment_id: id, p_status: 'failed', ...keep, p_reason: outcome.reason });
      return res.json(await snapshot(id, owner, { next: 'failed' }));
    }
    await call('update_payment', { p_payment_id: id, p_status: 'requires_action', ...keep });
    if (outcome.result === 'requires_3ds') {
      return res.json(await snapshot(id, owner, { next: '3ds' }));
    }
    await confirm(payment, outcome.providerRef);
    res.json(await snapshot(id, owner, { next: 'done' }));
  }));

  // 3. 3-D Secure SMS code.
  app.post('/api/payments/:id/3ds', limited, wrap(async (req, res) => {
    if (!sandbox) throw new HttpError(404, 'Not found.');
    const owner = readOwner(req.body);
    const id = readPaymentId(req);
    const payment = await loadOwned(id, owner);
    if (payment.status !== 'requires_action') throw new HttpError(409, 'This payment does not need a code.');

    const outcome = await provider.verifyOtp(payment, req.body?.otp);
    if (outcome.result === 'wrong_code') {
      return res.status(400).json({
        error: `Wrong code. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? 'try' : 'tries'} left.`,
        attemptsLeft: outcome.attemptsLeft,
      });
    }
    if (outcome.result === 'declined') {
      await fail(payment, outcome.reason);
      return res.json(await snapshot(id, owner, { next: 'failed' }));
    }
    await confirm(payment, outcome.providerRef);
    res.json(await snapshot(id, owner, { next: 'done' }));
  }));

  // 4. QR: the customer approves in the (simulated) banking app.
  app.post('/api/payments/:id/sandbox/qr', limited, wrap(async (req, res) => {
    if (!sandbox) throw new HttpError(404, 'Not found.');
    const owner = readOwner(req.body);
    const id = readPaymentId(req);
    const payment = await loadOwned(id, owner);
    if (!QR_METHODS.includes(payment.method)) throw new HttpError(409, 'This payment is not a QR payment.');
    if (payment.status !== 'awaiting') throw new HttpError(409, 'This payment is no longer waiting.');
    const action = req.body?.action === 'decline' ? 'decline' : 'approve';

    const outcome = await provider.qrDecision(payment, action);
    if (outcome.result === 'approved') await confirm(payment, outcome.providerRef);
    else await fail(payment, outcome.reason);
    res.json(await snapshot(id, owner, { next: outcome.result === 'approved' ? 'done' : 'failed' }));
  }));

  // 5. Poll the status (QR screen asks every 2 seconds).
  app.post('/api/payments/:id/status', wrap(async (req, res) => {
    const owner = readOwner(req.body);
    res.json(await snapshot(readPaymentId(req), owner));
  }));

  // 6. Webhook from a real provider (live mode). Signed with HMAC-SHA256 of the raw body.
  app.post('/api/payments/webhook/live', wrap(async (req, res) => {
    if (sandbox || !webhookSecret) throw new HttpError(404, 'Not found.');
    const sent = String(req.headers['x-signature'] ?? '');
    const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody ?? Buffer.alloc(0)).digest('hex');
    const a = Buffer.from(sent, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Bad signature.');

    const { paymentId, status, providerRef, amountKzt } = req.body ?? {};
    if (!UUID.test(paymentId ?? '')) throw new HttpError(400, 'Bad payment ID.');
    const payment = await call('backend_get_payment', { p_payment_id: paymentId, p_secret: secret });
    if (!payment) throw new HttpError(404, 'Payment not found.');
    if (status === 'paid') {
      // The amount comes from the signed body; the database checks it equals the order total.
      await call('confirm_payment', {
        p_payment_id: paymentId, p_provider_ref: providerRef ?? null,
        p_amount_kzt: Number(amountKzt), p_secret: secret,
      }).then(settleRefund);
    } else if (status === 'failed') {
      await fail(payment, 'The payment was not completed.').catch(() => {});
    }
    res.json({ ok: true }); // always 200 for known events, so the provider stops retrying
  }));

  // ---- background jobs -------------------------------------------------------------
  async function sweep() {
    try {
      await db.rpc('release_expired_holds');
      const pending = await call('list_pending_refunds', { p_secret: secret });
      for (const p of pending ?? []) {
        await settleRefund({ payment: { id: p.id, refund_status: 'pending', refund_kzt: p.amount_kzt, method: p.method } });
      }
    } catch (err) {
      console.error('Payment background job failed:', err?.message);
    }
  }

  function startBackgroundJobs(intervalMs = 60_000) {
    const timer = setInterval(sweep, intervalMs);
    timer.unref?.();
    return timer;
  }

  return { settleRefund, startBackgroundJobs, sweep };
}
