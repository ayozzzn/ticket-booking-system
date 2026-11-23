// Run:  PG_TEST_CONN="host=/tmp port=5544 user=pgtest dbname=kesh" PG_TEST_SECRET=<backend_secret> node --test backend/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { luhnOk, cardBrand, expiryOk } from '../payments/cards.js';
import { TEST_CARDS } from '../payments/providers/sandbox.js';
import { registerPaymentRoutes } from '../payments/routes.js';
import { fakeApp, pgDb, psql } from './helpers.js';

test('card helpers', () => {
  for (const n of Object.keys(TEST_CARDS)) assert.ok(luhnOk(n), `${n} must pass Luhn`);
  assert.equal(luhnOk('4242424242424241'), false);
  assert.equal(cardBrand('4242 4242'), 'visa');
  assert.equal(cardBrand('5555'), 'mastercard');
  assert.equal(cardBrand('2221 00'), 'mastercard');
  assert.equal(expiryOk(12, 2031), true);
  assert.equal(expiryOk(1, 2020), false);
  assert.equal(expiryOk(13, 2030), false);
  const d = new Date('2026-11-16T00:00:00Z');
  assert.equal(expiryOk(11, 2026, d), true, 'valid until the end of the month');
  assert.equal(expiryOk(10, 2026, d), false);
});

const CONN = process.env.PG_TEST_CONN;
const SECRET = process.env.PG_TEST_SECRET;
const needDb = { skip: !CONN || !SECRET ? 'set PG_TEST_CONN and PG_TEST_SECRET to run database tests' : false };

test('payment flows against a real database', needDb, async (t) => {
  const db = pgDb();
  const pass = (req, _res, next) => next();
  const app = fakeApp();
  const { settleRefund } = registerPaymentRoutes(app, { db, secret: SECRET, mode: 'sandbox', limited: pass });

  const eventId = psql(`insert into events (title, venue, city, starts_at) values ('E2E', 'Hall', 'Astana', now() + interval '10 days') returning id`).split('\n')[0];
  const tierId = psql(`insert into ticket_tiers (event_id, name, price_cents, capacity) values ('${eventId}', 'Std', 4000, 50) returning id`).split('\n')[0];
  t.after(() => {
    psql(`delete from payments where booking_id in (select id from bookings where event_id = '${eventId}')`);
    psql(`delete from bookings where event_id = '${eventId}'`);
    psql(`delete from events where id = '${eventId}'`);
  });

  const book = async (email, qty = 2) => (await db.rpc('create_booking', {
    p_tier_id: tierId, p_quantity: qty, p_customer_name: 'Test User', p_customer_email: email,
  })).data;
  const POST = (url, body) => app.invoke('POST', url, body);
  const card = (number, extra = {}) => ({ number, expMonth: 12, expYear: 2031, cvc: '123', holder: 'TEST USER', ...extra });

  await t.test('config', async () => {
    const r = await app.invoke('GET', '/api/payments/config');
    assert.equal(r.body.mode, 'sandbox');
    assert.deepEqual(r.body.methods, ['card', 'kaspi_qr', 'halyk_qr']);
    assert.ok(r.body.testCards.length >= 5);
    assert.equal(r.body.kztPerUsd, Number(psql("select value from payment_settings where key = 'kzt_per_usd'")));
  });

  await t.test('card: validation, decline, 3-D Secure, success, refund', async () => {
    const b = await book('card@example.com');
    assert.equal(b.status, 'pending');
    const owner = { code: b.booking_code, email: 'card@example.com' };

    let r = await POST('/api/payments', { ...owner, method: 'card' });
    assert.equal(r.status, 201);
    const id = r.body.payment.id;
    assert.equal(r.body.payment.amount_kzt, b.total_kzt);

    r = await POST(`/api/payments/${id}/card`, { ...owner, card: card('4000056655665556') }); // Luhn ok, not a test card
    assert.equal(r.status, 400); assert.match(r.body.error, /test card/i);
    r = await POST(`/api/payments/${id}/card`, { ...owner, card: card('4242424242424241') });
    assert.equal(r.status, 400); assert.match(r.body.error, /not valid/i);
    r = await POST(`/api/payments/${id}/card`, { ...owner, card: card('4242424242424242', { cvc: '12' }) });
    assert.equal(r.status, 400);
    r = await POST(`/api/payments/${id}/card`, { ...owner, card: card('4242424242424242', { expYear: 2020 }) });
    assert.equal(r.status, 400); assert.match(r.body.error, /expired/i);
    r = await POST(`/api/payments/${id}/status`, owner);
    assert.equal(r.body.payment.status, 'awaiting', 'typing mistakes do not fail the payment');

    r = await POST(`/api/payments/${id}/card`, { ...owner, card: card('4000000000009995') });
    assert.equal(r.body.next, 'failed');
    assert.equal(r.body.payment.failure_reason, 'Not enough money on the card.');
    assert.equal(r.body.receipt.status, 'pending', 'booking keeps the tickets after a failed card');

    r = await POST('/api/payments', { ...owner, method: 'card' });
    const id2 = r.body.payment.id;
    r = await POST(`/api/payments/${id2}/card`, { ...owner, card: card('4111 1111 1111 1111') });
    assert.equal(r.body.next, '3ds');
    assert.equal(r.body.payment.card_last4, '1111');
    assert.equal(r.body.payment.card_brand, 'visa');
    assert.ok(!JSON.stringify(r.body).includes('4111111111111111'), 'the full number is never returned');

    r = await POST(`/api/payments/${id2}/3ds`, { ...owner, otp: '000000' });
    assert.equal(r.status, 400); assert.equal(r.body.attemptsLeft, 2);
    r = await POST(`/api/payments/${id2}/3ds`, { ...owner, otp: '123456' });
    assert.equal(r.body.next, 'done');
    assert.equal(r.body.receipt.status, 'confirmed');
    assert.equal(r.body.payment.status, 'paid');

    // the full number is not stored anywhere
    assert.equal(psql(`select count(*) from payments where card_last4 is not null and length(card_last4) <> 4`), '0');

    // another customer cannot touch this payment
    r = await POST(`/api/payments/${id2}/status`, { code: owner.code, email: 'hacker@example.com' });
    assert.equal(r.status, 404);

    // cancel: 100% refund, paid back at once by the sandbox bank
    const cancelled = await db.rpc('cancel_booking', { p_code: owner.code, p_email: owner.email });
    assert.equal(cancelled.data.payment.refund_status, 'pending');
    const settled = await settleRefund(cancelled.data);
    assert.equal(settled.status, 'cancelled');
    assert.equal(settled.payment.refund_status, 'refunded');
    assert.equal(settled.payment.refund_kzt, b.total_kzt);
  });

  await t.test('3-D Secure: three wrong codes fail the payment', async () => {
    const b = await book('otp@example.com', 1);
    const owner = { code: b.booking_code, email: 'otp@example.com' };
    const id = (await POST('/api/payments', { ...owner, method: 'card' })).body.payment.id;
    await POST(`/api/payments/${id}/card`, { ...owner, card: card('5555555555554444') });
    let r;
    for (let i = 0; i < 3; i++) r = await POST(`/api/payments/${id}/3ds`, { ...owner, otp: '111111' });
    assert.equal(r.body.next, 'failed');
    assert.match(r.body.payment.failure_reason, /Too many/);
  });

  await t.test('QR: approve and decline, wrong method, polling', async () => {
    const b = await book('qr@example.com', 1);
    const owner = { code: b.booking_code, email: 'qr@example.com' };
    let r = await POST('/api/payments', { ...owner, method: 'kaspi_qr' });
    assert.equal(r.body.action.kind, 'qr');
    assert.match(r.body.action.payload, /^kesh-sandbox:\/\/pay\/kaspi_qr\//);
    const id = r.body.payment.id;
    r = await POST(`/api/payments/${id}/card`, { ...owner, card: card('4242424242424242') });
    assert.equal(r.status, 409, 'card route refuses a QR payment');

    r = await POST(`/api/payments/${id}/sandbox/qr`, { ...owner, action: 'decline' });
    assert.equal(r.body.next, 'failed');

    r = await POST('/api/payments', { ...owner, method: 'halyk_qr' });
    const id2 = r.body.payment.id;
    r = await POST(`/api/payments/${id2}/status`, owner);
    assert.equal(r.body.payment.status, 'awaiting');
    r = await POST(`/api/payments/${id2}/sandbox/qr`, { ...owner, action: 'approve' });
    assert.equal(r.body.next, 'done');
    assert.equal(r.body.receipt.status, 'confirmed');
    r = await POST(`/api/payments/${id2}/sandbox/qr`, { ...owner, action: 'approve' });
    assert.equal(r.status, 409, 'cannot approve twice');
  });

  await t.test('paying after the reservation expired is refused', async () => {
    const b = await book('late@example.com', 1);
    const owner = { code: b.booking_code, email: 'late@example.com' };
    psql(`update bookings set hold_expires_at = now() - interval '1 minute' where booking_code = '${b.booking_code}'`);
    const r = await POST('/api/payments', { ...owner, method: 'card' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /expired/i);
  });

  await t.test('input checks', async () => {
    assert.equal((await POST('/api/payments', { code: 'X', email: 'bad', method: 'card' })).status, 400);
    assert.equal((await POST('/api/payments', { code: 'ABC', email: 'a@b.co', method: 'bitcoin' })).status, 400);
    assert.equal((await POST('/api/payments/not-a-uuid/status', { code: 'ABC', email: 'a@b.co' })).status, 400);
  });

  await t.test('live mode: no provider connected, sandbox routes hidden, webhook is signed', async () => {
    const liveApp = fakeApp();
    const whSecret = 'webhook-test-secret';
    registerPaymentRoutes(liveApp, { db, secret: SECRET, mode: 'live', webhookSecret: whSecret, limited: pass });
    const b = await book('live@example.com', 1);
    const owner = { code: b.booking_code, email: 'live@example.com' };

    let r = await liveApp.invoke('POST', '/api/payments', { ...owner, method: 'card' });
    assert.equal(r.status, 501);
    r = await liveApp.invoke('GET', '/api/payments/config');
    assert.equal(r.body.mode, 'live'); assert.equal(r.body.testCards, undefined);

    // a payment row created by the backend (as a real provider integration would do)
    const pay = (await db.rpc('create_payment', { p_code: owner.code, p_email: owner.email, p_method: 'kaspi_qr', p_secret: SECRET })).data;
    r = await liveApp.invoke('POST', `/api/payments/${pay.id}/sandbox/qr`, { ...owner, action: 'approve' });
    assert.equal(r.status, 404, 'sandbox shortcuts do not exist in live mode');

    const send = (payload, sig) => {
      const raw = JSON.stringify(payload);
      const req = liveApp.invoke('POST', '/api/payments/webhook/live', raw, { 'x-signature': sig ?? crypto.createHmac('sha256', whSecret).update(raw).digest('hex') });
      return req;
    };
    // the fake app needs a parsed body: re-parse inside a wrapper
    const sendParsed = async (payload, sig) => {
      const raw = JSON.stringify(payload);
      const route = liveApp.routes.find((x) => x.path === '/api/payments/webhook/live');
      const out = { status: 200 };
      const res = { status: (c) => { out.status = c; return res; }, json: (x) => { out.body = x; return res; } };
      await route.handlers[0]({ params: {}, body: payload, rawBody: Buffer.from(raw),
        headers: { 'x-signature': sig ?? crypto.createHmac('sha256', whSecret).update(raw).digest('hex') } }, res, (e) => { throw e; });
      return out;
    };
    void send;
    assert.equal((await sendParsed({ paymentId: pay.id, status: 'paid', amountKzt: pay.amount_kzt }, 'deadbeef')).status, 401);
    assert.equal((await sendParsed({ paymentId: pay.id, status: 'paid', amountKzt: 1 })).status, 400, 'wrong amount refused');
    assert.equal(psql(`select status from bookings where booking_code = '${owner.code}'`), 'pending');
    assert.equal((await sendParsed({ paymentId: pay.id, status: 'paid', amountKzt: pay.amount_kzt, providerRef: 'p-1' })).status, 200);
    assert.equal(psql(`select status from bookings where booking_code = '${owner.code}'`), 'confirmed');
    assert.equal((await sendParsed({ paymentId: pay.id, status: 'paid', amountKzt: pay.amount_kzt, providerRef: 'p-1' })).status, 200, 'webhook retries are harmless');
  });
});

test('movie session: mixed ticket types, then card payment', needDb, async (t) => {
  const db = pgDb();
  const pass = (req, _res, next) => next();
  const app = fakeApp();
  registerPaymentRoutes(app, { db, secret: SECRET, mode: 'sandbox', limited: pass });

  const eventId = psql(`insert into events (title, category, venue, city, starts_at) values ('E2E Movie', 'Cinema', 'Cinemas', 'Almaty', now() - interval '20 days') returning id`).split('\n')[0];
  const cinemaId = psql(`select id from cinemas order by name limit 1`);
  const tierId = psql(`insert into ticket_tiers (event_id, name, price_cents, capacity, cinema_id, starts_at, hall, format)
    values ('${eventId}', 'Hall 1 · 2D', 300, 30, '${cinemaId}', now() + interval '6 days', 'Hall 1', '2D') returning id`).split('\n')[0];
  const adult = psql(`insert into tier_fares (tier_id, name, price_kzt, sort_order) values ('${tierId}', 'Adult', 2800, 1) returning id`).split('\n')[0];
  const child = psql(`insert into tier_fares (tier_id, name, price_kzt, sort_order) values ('${tierId}', 'Child', 1600, 2) returning id`).split('\n')[0];
  t.after(() => {
    psql(`delete from payments where booking_id in (select id from bookings where event_id = '${eventId}')`);
    psql(`delete from bookings where event_id = '${eventId}'`);
    psql(`delete from events where id = '${eventId}'`);
  });

  const { data: b, error } = await db.rpc('create_fare_booking', {
    p_tier_id: tierId, p_seat_ids: null,
    p_fares: [{ fare_id: adult, quantity: 2 }, { fare_id: child, quantity: 1 }],
    p_customer_name: 'Movie Fan', p_customer_email: 'movie@example.com',
  });
  assert.equal(error, null, error?.message);
  assert.equal(b.status, 'pending');
  assert.equal(b.total_kzt, 2 * 2800 + 1600);
  assert.deepEqual(b.fares.map((f) => `${f.quantity}x${f.name}`), ['2xAdult', '1xChild']);

  const owner = { code: b.booking_code, email: 'movie@example.com' };
  const start = await app.invoke('POST', '/api/payments', { ...owner, method: 'card' });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  assert.equal(start.body.payment.amount_kzt, 7200);
  const paid = await app.invoke('POST', `/api/payments/${start.body.payment.id}/card`, {
    ...owner, card: { number: '4242424242424242', expMonth: 12, expYear: 2031, cvc: '123', holder: 'MOVIE FAN' },
  });
  assert.equal(paid.body.receipt.status, 'confirmed', JSON.stringify(paid.body));
  assert.equal(paid.body.receipt.hall, 'Hall 1');
});
