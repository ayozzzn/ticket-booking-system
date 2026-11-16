import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { registerPaymentRoutes } from './payments/routes.js';

const {
  SUPABASE_URL, SUPABASE_ANON_KEY, FRONTEND_ORIGIN, PORT = '3001',
  PAYMENT_DB_SECRET, PAYMENT_MODE = 'sandbox', PAYMENT_WEBHOOK_SECRET,
} = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FRONTEND_ORIGIN) {
  console.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY or FRONTEND_ORIGIN in .env');
  process.exit(1);
}
if (!PAYMENT_DB_SECRET) {
  console.error('Missing PAYMENT_DB_SECRET in .env (run: SELECT value FROM payment_settings WHERE key = \'backend_secret\';)');
  process.exit(1);
}
if (!['sandbox', 'live'].includes(PAYMENT_MODE)) {
  console.error('PAYMENT_MODE must be "sandbox" or "live"');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN.split(',').map(s => s.trim()), methods: ['GET', 'POST'] }));
// rawBody is needed to check the HMAC signature of provider webhooks
app.use(express.json({ limit: '20kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
// The payment screen asks "paid yet?" every 3 seconds, so that one route has its own, larger limit.
const isStatusPoll = (req) => /^\/payments\/[^/]+\/status$/.test(req.path);
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, skip: isStatusPoll, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 400, skip: (req) => !isStatusPoll(req), standardHeaders: 'draft-7', legacyHeaders: false }));
const limited = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
// Paying takes several requests (start, card, SMS code, retries), so it gets more room than booking.
const payLimited = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });
const sendError = (res, error) => {
  // P0001 = RAISE EXCEPTION in our SQL functions: those texts are written for customers ("Only 2 ticket(s) left...").
  if (error?.code === 'P0001' && error.message) return res.status(400).json({ error: error.message });
  console.error('Supabase request failed:', error?.message);
  res.status(400).json({ error: 'Request failed. Check input or permissions.' });
};
const bearer = (req) => req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
const clientFor = (token) => token
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : db;
const isText = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const emailOk = v => isText(v, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const uuidOk = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const { settleRefund, startBackgroundJobs } = registerPaymentRoutes(app, {
  db, secret: PAYMENT_DB_SECRET, mode: PAYMENT_MODE, webhookSecret: PAYMENT_WEBHOOK_SECRET, limited: payLimited,
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'kesh-backend' }));
app.get('/api/events', asyncRoute(async (_req, res) => {
  const { data, error } = await db.from('events').select('*, ticket_tiers(*)').order('starts_at', { ascending: true });
  if (error) return sendError(res, error);
  res.json(data);
}));
app.get('/api/events/:id', asyncRoute(async (req, res) => {
  if (!uuidOk(req.params.id)) return res.status(400).json({ error: 'Invalid event ID' });
  const { data, error } = await db.from('events').select('*, ticket_tiers(*)').eq('id', req.params.id).maybeSingle();
  if (error) return sendError(res, error);
  if (!data) return res.status(404).json({ error: 'Event not found' });
  res.json(data);
}));
app.post('/api/bookings', limited, asyncRoute(async (req, res) => {
  const { tierId, quantity, customerName, customerEmail } = req.body ?? {};
  if (!uuidOk(tierId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !isText(customerName, 120) || !emailOk(customerEmail)) {
    return res.status(400).json({ error: 'Invalid booking input' });
  }
  // With a login token the booking is linked to the account. The booking is "pending": it holds the
  // tickets for a few minutes and becomes confirmed only after payment (see /api/payments).
  const token = bearer(req);
  if (token) {
    const { data: userData } = await db.auth.getUser(token);
    if (!userData?.user) return res.status(401).json({ error: 'Invalid session' });
  }
  const { data, error } = await clientFor(token).rpc('create_booking', {
    p_tier_id: tierId, p_quantity: quantity, p_customer_name: customerName.trim(), p_customer_email: customerEmail.trim()
  });
  if (error) return sendError(res, error);
  res.status(201).json(data);
}));
// Seat map of a reserved-seating ticket type (no personal data, only which seats are taken).
app.get('/api/tiers/:id/seats', asyncRoute(async (req, res) => {
  if (!uuidOk(req.params.id)) return res.status(400).json({ error: 'Invalid ticket type ID' });
  const { data, error } = await db.rpc('get_tier_seats', { p_tier_id: req.params.id });
  if (error) return sendError(res, error);
  res.json(data ?? []);
}));
// Booking with chosen seats. Like /api/bookings it is "pending": the seats are held while the customer pays.
app.post('/api/bookings/seats', limited, asyncRoute(async (req, res) => {
  const { tierId, seatIds, customerName, customerEmail } = req.body ?? {};
  const seatsOk = Array.isArray(seatIds) && seatIds.length >= 1 && seatIds.length <= 10
    && seatIds.every(uuidOk) && new Set(seatIds).size === seatIds.length;
  if (!uuidOk(tierId) || !seatsOk || !isText(customerName, 120) || !emailOk(customerEmail)) {
    return res.status(400).json({ error: 'Invalid booking input' });
  }
  const token = bearer(req);
  if (token) {
    const { data: userData } = await db.auth.getUser(token);
    if (!userData?.user) return res.status(401).json({ error: 'Invalid session' });
  }
  const { data, error } = await clientFor(token).rpc('create_booking_with_seats', {
    p_tier_id: tierId, p_seat_ids: seatIds, p_customer_name: customerName.trim(), p_customer_email: customerEmail.trim()
  });
  if (error) return sendError(res, error);
  res.status(201).json(data);
}));
app.post('/api/bookings/lookup', limited, asyncRoute(async (req, res) => {
  const { code, email } = req.body ?? {};
  if (!isText(code, 60) || !emailOk(email)) return res.status(400).json({ error: 'Invalid lookup input' });
  const { data, error } = await db.rpc('get_booking', { p_code: code, p_email: email });
  if (error) return sendError(res, error);
  if (!data) return res.status(404).json({ error: 'Booking not found' });
  res.json(data);
}));
app.post('/api/bookings/cancel', limited, asyncRoute(async (req, res) => {
  const { code, email } = req.body ?? {};
  if (!isText(code, 60) || !emailOk(email)) return res.status(400).json({ error: 'Invalid cancellation input' });
  const { data, error } = await db.rpc('cancel_booking', { p_code: code, p_email: email });
  if (error) return sendError(res, error);
  res.json(await settleRefund(data)); // pays the refund (sandbox: at once) before answering
}));
app.get('/api/bookings/my', asyncRoute(async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  const { data: userData, error: authError } = await db.auth.getUser(token);
  if (authError || !userData.user) return res.status(401).json({ error: 'Invalid session' });
  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await userDb.rpc('get_my_bookings');
  if (error) return sendError(res, error);
  res.json(data);
}));
app.post('/api/bookings/my/cancel', limited, asyncRoute(async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  const { code } = req.body ?? {};
  if (!isText(code, 60)) return res.status(400).json({ error: 'Invalid booking code' });
  const { data: userData, error: authError } = await db.auth.getUser(token);
  if (authError || !userData.user) return res.status(401).json({ error: 'Invalid session' });
  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await userDb.rpc('cancel_my_booking', { p_code: code });
  if (error) return sendError(res, error);
  res.json(await settleRefund(data));
}));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Server error' });
});
startBackgroundJobs(); // releases expired holds and retries pending refunds every minute
app.listen(Number(PORT), () => console.log(`Kesh backend: http://localhost:${PORT}/api/health (payments: ${PAYMENT_MODE})`));
