/*
# Kazakhstan payments: card, Kaspi QR, Halyk QR, refunds

Run AFTER all previous migrations. Safe to run more than once.

## What changes
1. A booking is no longer "confirmed" the moment it is created.
   - create_booking now creates a booking with status 'pending' and HOLDS the tickets for
     `hold_minutes` (default 10). Free tickets (price 0) are confirmed immediately.
   - The booking becomes 'confirmed' only when a payment is confirmed (confirm_payment).
   - If nobody pays in time the hold is released and the booking becomes 'expired'.
   - This also closes a hole: before, anyone with the public anon key could call create_booking
     directly and get a confirmed booking without paying.
2. `payments` table: one row per payment attempt (method, amount in KZT, status, card brand and
   last 4 digits ONLY, refund data). Full card numbers are never stored anywhere.
3. Prices stay in USD cents (the catalogue is not changed). The tenge amount is calculated once,
   when the booking is created: round(price_cents x kzt_per_usd / 100). It is stored in
   bookings.total_kzt, so the customer always pays the amount they saw.
4. Cancellation with refund. Cancelling a PAID booking calculates a refund by how close the event is:
      48 h or more before the start  -> 100 %
      24 h to 48 h                   ->  75 %
      less than 24 h                 ->  50 %
   Change refund_percent_for() below if your business rules are different.
   Cancelling an UNPAID (pending) booking just releases the tickets (status 'expired').
5. Security of money functions. confirm_payment, create_payment, update_payment, complete_refund,
   list_pending_refunds and backend_get_payment need the backend secret (payment_settings row
   'backend_secret'). Only your Express backend knows it, so a visitor who has the public anon key
   cannot mark a payment as paid.

## After running this file
  SELECT value FROM payment_settings WHERE key = 'backend_secret';
Copy that value into backend/.env as PAYMENT_DB_SECRET. Change the exchange rate when needed:
  UPDATE payment_settings SET value = '510' WHERE key = 'kzt_per_usd';
*/

-- 1. Private settings ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_settings FROM PUBLIC, anon, authenticated;

INSERT INTO public.payment_settings (key, value) VALUES
  ('kzt_per_usd', '500'),
  ('hold_minutes', '10'),
  ('backend_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO NOTHING;

-- 2. Booking columns and statuses ---------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total_kzt integer CHECK (total_kzt >= 0);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

UPDATE public.bookings
SET total_kzt = round(total_cents * (SELECT value::numeric FROM public.payment_settings WHERE key = 'kzt_per_usd') / 100.0)
WHERE total_kzt IS NULL;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS idx_bookings_pending_hold
  ON public.bookings (hold_expires_at) WHERE status = 'pending';

-- 3. Payments -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  method         text NOT NULL CHECK (method IN ('card', 'kaspi_qr', 'halyk_qr')),
  provider       text NOT NULL DEFAULT 'sandbox',
  provider_ref   text,
  amount_kzt     integer NOT NULL CHECK (amount_kzt >= 0),
  status         text NOT NULL DEFAULT 'awaiting'
                 CHECK (status IN ('awaiting', 'requires_action', 'paid', 'failed', 'cancelled', 'expired')),
  card_brand     text,
  card_last4     text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  failure_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  refund_percent integer CHECK (refund_percent BETWEEN 0 AND 100),
  refund_kzt     integer NOT NULL DEFAULT 0 CHECK (refund_kzt >= 0),
  refund_status  text NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none', 'pending', 'refunded')),
  refund_ref     text,
  refunded_at    timestamptz,
  CHECK (refund_kzt <= amount_kzt)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments (booking_id);
-- At most one payment in progress per booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_active_per_booking
  ON public.payments (booking_id) WHERE status IN ('awaiting', 'requires_action');
-- At most one successful payment per booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_paid_per_booking
  ON public.payments (booking_id) WHERE status = 'paid';

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payments TO authenticated;
DROP POLICY IF EXISTS "admins_read_payments" ON public.payments;
CREATE POLICY "admins_read_payments" ON public.payments
  FOR SELECT TO authenticated USING (public.is_admin());

-- 4. Helpers (private) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payment_secret_ok(p_secret text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_secret IS NOT NULL
     AND p_secret = (SELECT value FROM public.payment_settings WHERE key = 'backend_secret');
$$;

CREATE OR REPLACE FUNCTION public._require_backend(p_secret text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._payment_secret_ok(p_secret) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Refund rule. Edit here if your policy is different.
CREATE OR REPLACE FUNCTION public.refund_percent_for(p_starts_at timestamptz, p_at timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_starts_at - p_at >= interval '48 hours' THEN 100
    WHEN p_starts_at - p_at >= interval '24 hours' THEN 75
    ELSE 50
  END;
$$;

CREATE OR REPLACE FUNCTION public._payment_json(p public.payments)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id,
    'method', p.method,
    'status', p.status,
    'amount_kzt', p.amount_kzt,
    'card_brand', p.card_brand,
    'card_last4', p.card_last4,
    'failure_reason', p.failure_reason,
    'paid_at', p.paid_at,
    'refund_percent', p.refund_percent,
    'refund_kzt', p.refund_kzt,
    'refund_status', p.refund_status,
    'refunded_at', p.refunded_at
  ) END;
$$;

-- The one JSON shape every booking function returns.
CREATE OR REPLACE FUNCTION public._booking_json(b public.bookings)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'booking_code', b.booking_code,
    'status', b.status,
    'cancelled_at', b.cancelled_at,
    'customer_name', b.customer_name,
    'customer_email', b.customer_email,
    'quantity', b.quantity,
    'total_cents', b.total_cents,
    'unit_price_cents', b.unit_price_cents,
    'total_kzt', b.total_kzt,
    'hold_expires_at', b.hold_expires_at,
    'created_at', b.created_at,
    'event_title', e.title,
    'event_venue', e.venue,
    'event_city', e.city,
    'event_starts_at', e.starts_at,
    'tier_name', t.name,
    'payment', (
      SELECT public._payment_json(p)
      FROM public.payments p
      WHERE p.booking_id = b.id
      ORDER BY (p.status = 'paid') DESC, p.created_at DESC
      LIMIT 1
    ),
    'refund_quote', CASE
      WHEN b.status = 'confirmed' AND pp.id IS NOT NULL THEN jsonb_build_object(
        'percent', public.refund_percent_for(e.starts_at),
        'kzt', floor(pp.amount_kzt * public.refund_percent_for(e.starts_at) / 100.0)::int)
      ELSE NULL END
  )
  FROM public.events e
  JOIN public.ticket_tiers t ON t.id = b.tier_id
  LEFT JOIN public.payments pp ON pp.booking_id = b.id AND pp.status = 'paid'
  WHERE e.id = b.event_id;
$$;

-- Release tickets of pending bookings whose hold ran out.
CREATE OR REPLACE FUNCTION public.release_expired_holds()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id, tier_id, quantity FROM public.bookings
    WHERE status = 'pending' AND hold_expires_at <= now()
    ORDER BY id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ticket_tiers SET sold = sold - r.quantity WHERE id = r.tier_id;
    UPDATE public.bookings SET status = 'expired' WHERE id = r.id;
    UPDATE public.payments SET status = 'expired', updated_at = now()
      WHERE booking_id = r.id AND status IN ('awaiting', 'requires_action');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- 5. Customer-facing functions (rewritten) ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking(p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.release_expired_holds();
  SELECT * INTO b FROM public.bookings
  WHERE booking_code = upper(trim(p_code))
    AND lower(customer_email) = lower(trim(p_email));
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public._booking_json(b);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_bookings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM public.release_expired_holds();
  SELECT COALESCE(jsonb_agg(public._booking_json(b) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.bookings b
  WHERE b.user_id = auth.uid()
     OR (b.user_id IS NULL AND b.customer_email = lower(coalesce(auth.jwt() ->> 'email', '')));
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_tier_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier public.ticket_tiers%ROWTYPE;
  v_starts timestamptz;
  v_already integer;
  v_code text;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_rate numeric;
  v_hold integer;
  v_free boolean;
  v_booking public.bookings;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Please choose between 1 and 10 tickets.';
  END IF;
  IF length(v_name) = 0 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;

  PERFORM public.release_expired_holds();

  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type no longer exists.';
  END IF;

  SELECT starts_at INTO v_starts FROM public.events WHERE id = v_tier.event_id;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This event has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM public.bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status IN ('confirmed', 'pending');
  IF v_already + p_quantity > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  IF v_tier.capacity - v_tier.sold < p_quantity THEN
    RAISE EXCEPTION 'Only % ticket(s) left for this option.', v_tier.capacity - v_tier.sold;
  END IF;

  SELECT value::numeric INTO v_rate FROM public.payment_settings WHERE key = 'kzt_per_usd';
  SELECT value::integer INTO v_hold FROM public.payment_settings WHERE key = 'hold_minutes';
  v_free := v_tier.price_cents = 0;

  UPDATE public.ticket_tiers SET sold = sold + p_quantity WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, total_kzt,
    customer_name, customer_email, user_id,
    status, hold_expires_at
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, p_quantity,
    v_tier.price_cents, v_tier.price_cents * p_quantity,
    round(v_tier.price_cents * p_quantity * v_rate / 100.0)::integer,
    v_name, v_email, auth.uid(),
    CASE WHEN v_free THEN 'confirmed' ELSE 'pending' END,
    CASE WHEN v_free THEN NULL ELSE now() + make_interval(mins => coalesce(v_hold, 10)) END
  ) RETURNING * INTO v_booking;

  RETURN public._booking_json(v_booking);
END;
$$;

-- Shared cancellation logic. Pending = give up (release the hold). Confirmed = refund by policy.
CREATE OR REPLACE FUNCTION public._cancel_booking_row(b public.bookings)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_starts timestamptz;
  v_pay public.payments;
  v_pct integer;
  v_refund integer;
BEGIN
  IF b.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking is already cancelled.';
  END IF;
  IF b.status = 'expired' THEN
    RAISE EXCEPTION 'This booking has already expired.';
  END IF;

  SELECT starts_at INTO v_starts FROM public.events WHERE id = b.event_id;

  IF b.status = 'pending' THEN
    UPDATE public.ticket_tiers SET sold = sold - b.quantity WHERE id = b.tier_id;
    UPDATE public.bookings SET status = 'expired' WHERE id = b.id;
    UPDATE public.payments SET status = 'cancelled', updated_at = now()
      WHERE booking_id = b.id AND status IN ('awaiting', 'requires_action');
    RETURN;
  END IF;

  IF v_starts <= now() THEN
    RAISE EXCEPTION 'Bookings for events that already started cannot be cancelled.';
  END IF;

  UPDATE public.ticket_tiers SET sold = sold - b.quantity WHERE id = b.tier_id;
  UPDATE public.bookings SET status = 'cancelled', cancelled_at = now() WHERE id = b.id;

  SELECT * INTO v_pay FROM public.payments
  WHERE booking_id = b.id AND status = 'paid' FOR UPDATE;
  IF FOUND THEN
    v_pct := public.refund_percent_for(v_starts);
    v_refund := floor(v_pay.amount_kzt * v_pct / 100.0)::integer;
    UPDATE public.payments
    SET refund_percent = v_pct,
        refund_kzt = v_refund,
        refund_status = CASE WHEN v_refund > 0 THEN 'pending' ELSE 'none' END,
        updated_at = now()
    WHERE id = v_pay.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE booking_code = upper(trim(p_code))
    AND lower(customer_email) = lower(trim(p_email))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking matches that code and email.';
  END IF;

  PERFORM public._cancel_booking_row(v_booking);
  RETURN public.get_booking(v_booking.booking_code, v_booking.customer_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_booking(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please log in to manage your bookings.';
  END IF;

  SELECT * INTO v_booking FROM public.bookings
  WHERE booking_code = upper(trim(p_code))
    AND (user_id = auth.uid() OR (user_id IS NULL AND customer_email = v_email))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking with that code was found in your account.';
  END IF;

  PERFORM public._cancel_booking_row(v_booking);
  RETURN public.get_booking(v_booking.booking_code, v_booking.customer_email);
END;
$$;

-- Poll the state of one payment (customer proves ownership with booking code + email).
CREATE OR REPLACE FUNCTION public.get_payment_status(p_payment_id uuid, p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_booking public.bookings;
BEGIN
  PERFORM public.release_expired_holds();
  SELECT b.* INTO v_booking FROM public.bookings b
  WHERE b.booking_code = upper(trim(p_code)) AND lower(b.customer_email) = lower(trim(p_email));
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id AND booking_id = v_booking.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('payment', public._payment_json(v_pay), 'receipt', public._booking_json(v_booking));
END;
$$;

-- 6. Backend-only functions (need the backend secret) -------------------------------
CREATE OR REPLACE FUNCTION public.create_payment(p_code text, p_email text, p_method text, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_pay public.payments;
BEGIN
  PERFORM public._require_backend(p_secret);
  IF p_method IS NULL OR p_method NOT IN ('card', 'kaspi_qr', 'halyk_qr') THEN
    RAISE EXCEPTION 'Unknown payment method.';
  END IF;

  PERFORM public.release_expired_holds();

  SELECT * INTO v_booking FROM public.bookings
  WHERE booking_code = upper(trim(p_code)) AND lower(customer_email) = lower(trim(p_email))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking matches that code and email.';
  END IF;
  IF v_booking.status = 'confirmed' THEN
    RAISE EXCEPTION 'This booking is already paid.';
  END IF;
  IF v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'Your reservation expired. Please choose your tickets again.';
  END IF;

  -- A new attempt replaces the one in progress (for example when the customer switches method).
  UPDATE public.payments SET status = 'cancelled', updated_at = now()
  WHERE booking_id = v_booking.id AND status IN ('awaiting', 'requires_action');

  -- Give the customer a little time to finish, but never hold tickets longer than 20 minutes.
  UPDATE public.bookings
  SET hold_expires_at = LEAST(created_at + interval '20 minutes',
                              GREATEST(hold_expires_at, now() + interval '5 minutes'))
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  INSERT INTO public.payments (booking_id, method, amount_kzt)
  VALUES (v_booking.id, p_method, v_booking.total_kzt)
  RETURNING * INTO v_pay;

  RETURN public._payment_json(v_pay)
         || jsonb_build_object('hold_expires_at', v_booking.hold_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_get_payment(p_payment_id uuid, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_booking public.bookings;
BEGIN
  PERFORM public._require_backend(p_secret);
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_pay.booking_id;
  RETURN public._payment_json(v_pay) || jsonb_build_object(
    'provider', v_pay.provider,
    'provider_ref', v_pay.provider_ref,
    'booking_code', v_booking.booking_code,
    'customer_email', v_booking.customer_email,
    'booking_status', v_booking.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payment(
  p_payment_id uuid,
  p_status text,
  p_card_brand text,
  p_card_last4 text,
  p_reason text,
  p_provider_ref text,
  p_secret text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
BEGIN
  PERFORM public._require_backend(p_secret);
  IF p_status NOT IN ('awaiting', 'requires_action', 'failed') THEN
    RAISE EXCEPTION 'Invalid payment status.';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found.';
  END IF;
  IF v_pay.status NOT IN ('awaiting', 'requires_action') THEN
    RAISE EXCEPTION 'This payment is already %.', v_pay.status;
  END IF;

  UPDATE public.payments
  SET status = p_status,
      card_brand = coalesce(p_card_brand, card_brand),
      card_last4 = coalesce(p_card_last4, card_last4),
      failure_reason = CASE WHEN p_status = 'failed' THEN left(p_reason, 200) ELSE NULL END,
      provider_ref = coalesce(p_provider_ref, provider_ref),
      updated_at = now()
  WHERE id = v_pay.id
  RETURNING * INTO v_pay;

  RETURN public._payment_json(v_pay);
END;
$$;

-- The only way a booking becomes confirmed. Safe to call twice (webhooks are retried).
CREATE OR REPLACE FUNCTION public.confirm_payment(
  p_payment_id uuid,
  p_provider_ref text,
  p_amount_kzt integer,
  p_secret text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_booking public.bookings;
  v_tier public.ticket_tiers;
  v_starts timestamptz;
  v_refund_all boolean := false;
BEGIN
  PERFORM public._require_backend(p_secret);

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found.';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_pay.booking_id FOR UPDATE;

  IF v_pay.status = 'paid' THEN
    RETURN public._booking_json(v_booking);
  END IF;
  IF p_amount_kzt IS DISTINCT FROM v_pay.amount_kzt THEN
    RAISE EXCEPTION 'Paid amount does not match the order.';
  END IF;

  IF v_booking.status = 'pending' THEN
    UPDATE public.bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = v_booking.id;

  ELSIF v_booking.status = 'expired' THEN
    -- The money arrived after the hold was released: take the tickets back if they are still free.
    SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = v_booking.tier_id FOR UPDATE;
    SELECT starts_at INTO v_starts FROM public.events WHERE id = v_booking.event_id;
    IF v_starts > now() AND v_tier.capacity - v_tier.sold >= v_booking.quantity THEN
      UPDATE public.ticket_tiers SET sold = sold + v_booking.quantity WHERE id = v_tier.id;
      UPDATE public.bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = v_booking.id;
    ELSE
      v_refund_all := true;
    END IF;

  ELSE
    -- already confirmed by another payment, or cancelled: give the money back
    v_refund_all := true;
  END IF;

  UPDATE public.payments
  SET status = 'paid',
      paid_at = now(),
      updated_at = now(),
      failure_reason = NULL,
      provider_ref = coalesce(p_provider_ref, provider_ref),
      refund_percent = CASE WHEN v_refund_all THEN 100 ELSE refund_percent END,
      refund_kzt = CASE WHEN v_refund_all THEN amount_kzt ELSE refund_kzt END,
      refund_status = CASE WHEN v_refund_all AND amount_kzt > 0 THEN 'pending' ELSE refund_status END
  WHERE id = v_pay.id;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking.id;
  RETURN public._booking_json(v_booking);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_refund(p_payment_id uuid, p_refund_ref text, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_booking public.bookings;
BEGIN
  PERFORM public._require_backend(p_secret);
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found.';
  END IF;
  IF v_pay.refund_status = 'pending' THEN
    UPDATE public.payments
    SET refund_status = 'refunded', refunded_at = now(), refund_ref = p_refund_ref, updated_at = now()
    WHERE id = v_pay.id;
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_pay.booking_id;
  RETURN public._booking_json(v_booking);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_pending_refunds(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._require_backend(p_secret);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'amount_kzt', refund_kzt, 'provider', provider,
                                        'provider_ref', provider_ref, 'method', method)
                     ORDER BY updated_at)
    FROM public.payments WHERE refund_status = 'pending'
  ), '[]'::jsonb);
END;
$$;

-- 7. Audit view: held tickets count as sold -----------------------------------------
CREATE OR REPLACE VIEW public.v_sold_integrity AS
SELECT
  t.id AS tier_id,
  e.title AS event_title,
  t.name AS tier_name,
  t.sold AS recorded_sold,
  t.baseline_sold,
  COALESCE(SUM(b.quantity) FILTER (WHERE b.status IN ('confirmed', 'pending')), 0)::int AS confirmed_quantity,
  (t.sold = t.baseline_sold
            + COALESCE(SUM(b.quantity) FILTER (WHERE b.status IN ('confirmed', 'pending')), 0)) AS is_consistent
FROM public.ticket_tiers t
JOIN public.events e ON e.id = t.event_id
LEFT JOIN public.bookings b ON b.tier_id = t.id
GROUP BY t.id, e.title, t.name, t.sold, t.baseline_sold;
REVOKE ALL ON public.v_sold_integrity FROM PUBLIC, anon, authenticated;

-- The shop shows "about 22 500 KZT" before the customer books, so the rate is public.
CREATE OR REPLACE FUNCTION public.get_exchange_rate()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT value::numeric FROM public.payment_settings WHERE key = 'kzt_per_usd'; $$;

-- 8. Privileges ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public._payment_secret_ok(text), public._require_backend(text),
  public._payment_json(public.payments), public._booking_json(public.bookings),
  public._cancel_booking_row(public.bookings)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.get_booking(text, text), public.create_booking(uuid, integer, text, text),
  public.cancel_booking(text, text), public.get_payment_status(uuid, text, text),
  public.release_expired_holds(), public.refund_percent_for(timestamptz, timestamptz),
  public.get_exchange_rate(),
  public.create_payment(text, text, text, text), public.backend_get_payment(uuid, text),
  public.update_payment(uuid, text, text, text, text, text, text),
  public.confirm_payment(uuid, text, integer, text), public.complete_refund(uuid, text, text),
  public.list_pending_refunds(text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.get_booking(text, text), public.create_booking(uuid, integer, text, text),
  public.cancel_booking(text, text), public.get_payment_status(uuid, text, text),
  public.release_expired_holds(), public.refund_percent_for(timestamptz, timestamptz),
  public.get_exchange_rate(),
  -- the next ones check the backend secret inside; the backend calls them with the anon key
  public.create_payment(text, text, text, text), public.backend_get_payment(uuid, text),
  public.update_payment(uuid, text, text, text, text, text, text),
  public.confirm_payment(uuid, text, integer, text), public.complete_refund(uuid, text, text),
  public.list_pending_refunds(text)
TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_bookings(), public.cancel_my_booking(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings(), public.cancel_my_booking(text) TO authenticated;
