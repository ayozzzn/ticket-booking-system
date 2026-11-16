# Kesh Backend (Node.js + Express)

An optional **separate REST API server** for the existing Kesh React/Vite + Supabase project. It uses the existing Supabase PostgreSQL schema and SQL RPC functions; **no new database** is needed.

## Requirements
- Node.js 20+
- An existing Supabase project with all SQL migrations from `supabase/migrations` applied
- A public Supabase anon/publishable key. **Never use the service_role/secret key here.**

## Run locally (PowerShell)
1. Extract this folder beside your `ticket-booking-system` project (or copy it into the repo as `backend/`).
2. Open a VS Code terminal in the `kesh-backend` folder.
3. Run `npm install`.
4. Run `Copy-Item .env.example .env`.
5. Edit `.env`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `FRONTEND_ORIGIN` (usually `http://localhost:5173` for local Vite).
6. Run `npm run dev`.
7. Open `http://localhost:3001/api/health`. Expected: `{"status":"ok","service":"kesh-backend"}`.
8. Open `http://localhost:3001/api/events` to test database access.

If PowerShell blocks npm scripts, use `npm.cmd install` and `npm.cmd run dev`.

## API
| Method | Path | Body / Auth |
|---|---|---|
| GET | `/api/health` | none |
| GET | `/api/events` | none |
| GET | `/api/events/:id` | UUID |
| GET | `/api/tiers/:id/seats` | none (seat map of a reserved-seating ticket type) |
| POST | `/api/bookings/seats` | `{ "tierId": "UUID", "seatIds": ["UUID"], "customerName": "...", "customerEmail": "..." }` (pending, then pay) |
| POST | `/api/bookings` | `{ "tierId": "UUID", "quantity": 1, "customerName": "Test User", "customerEmail": "test@example.com" }` |
| POST | `/api/bookings/lookup` | `{ "code": "BOOKING_CODE", "email": "test@example.com" }` |
| POST | `/api/bookings/cancel` | `{ "code": "BOOKING_CODE", "email": "test@example.com" }` |
| GET | `/api/bookings/my` | `Authorization: Bearer <Supabase user access token>` |

**Warning:** Booking POST endpoints modify live data. Test on a test Supabase project or with designated test bookings. Cancellation uses the existing project's code+email RPC; evaluate that security model before real production use.

## Payments (Kazakhstan: card, Kaspi QR, Halyk QR, refunds)
1. Run `supabase/migrations/20261116120000_kz_payments.sql` (after all older migrations), then `supabase/tests/payment_checks.sql`.
2. `SELECT value FROM payment_settings WHERE key = 'backend_secret';` and put the value in `.env` as `PAYMENT_DB_SECRET`.
3. Exchange rate (prices are USD in the catalogue): `UPDATE payment_settings SET value = '510' WHERE key = 'kzt_per_usd';`
4. `PAYMENT_MODE=sandbox` (default) uses a fake bank with test cards (see the card screen), no real money.
   `PAYMENT_MODE=live` needs a real provider: implement `payments/providers/live.js` (merchant contract with Kaspi/Halyk/Freedom etc. required).
   The signed webhook `POST /api/payments/webhook/live` and refund retry already exist.
5. Flow: booking is `pending` and holds tickets 10 min -> pay -> `confirmed`. Unpaid -> `expired`. Cancelling a paid booking refunds 100% (48h+), 75% (24-48h), 50% (less) by `refund_percent_for()` in SQL.
6. Tests: `PG_TEST_CONN="host=... dbname=..." PG_TEST_SECRET=... npm test` (needs `psql`; card helper tests run without it).

## Important: integration and deployment are still separate tasks
- The existing React frontend **still calls Supabase directly**. Adding this server alone does not make frontend requests use Express. To integrate, change the relevant functions in `src/lib/bookingApi.ts` and `src/lib/myBookingsApi.ts` to use `fetch` against the backend base URL (and pass Supabase access tokens for authenticated routes).
- This backend runs **locally only** until deployed to a Node-compatible hosting service. The existing Vercel frontend deployment does not automatically host this separate long-running Express process.
- Configure `FRONTEND_ORIGIN` to the actual Vercel domain in production. Deploying behind a reverse proxy may require additional trusted proxy/rate-limit configuration.
- Do not commit `.env`, API secrets or private keys. The public anon key is not a privileged credential; keep RLS and SQL permissions enforced in Supabase.
- This is a **starter backend**, not a tested production release. Add integration tests, monitoring, stricter abuse protection, and security review before production use.
