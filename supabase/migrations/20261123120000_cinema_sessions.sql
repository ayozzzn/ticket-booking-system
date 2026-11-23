/*
# Cinemas, sessions and ticket types (adult / student / child)

Run AFTER 20261116170000_seats_with_payments.sql and 20261122120000_event_trailers.sql.
Safe to run more than once.

How it fits the existing model (nothing old is removed):
- events        = the movie (title, poster, trailer, description, age rating, duration).
- cinemas       = NEW. Almaty cinemas, managed in the admin panel (Admin > Cinemas).
- ticket_tiers  = a SESSION when it has starts_at + cinema_id: one showing of the movie
                  in one hall at one time. It keeps its own capacity and seat map, so seats,
                  holds, payments and refunds work exactly as before.
                  Concert tiers (VIP, Standard, Fan zone...) stay as they are.
- tier_fares    = NEW. Ticket types of a session with their own price in tenge:
                  Adult, Student, Child (admin can add others, e.g. Pensioner).
- bookings.fare_lines = what the customer chose, e.g. 2 x Adult + 1 x Child.

Booking a session with ticket types: create_fare_booking(...). The old create_booking /
create_booking_with_seats refuse sessions that have ticket types, so nobody can buy
a child-priced seat through the old path or skip choosing a type.
Times: everything that checked "has the event started" or computed refunds now uses
the SESSION time (tier_starts_at), not the movie's release date.
*/

-- 1. Movie details ---------------------------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS age_rating text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_duration_check;
ALTER TABLE public.events ADD CONSTRAINT events_duration_check
  CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_age_rating_check;
ALTER TABLE public.events ADD CONSTRAINT events_age_rating_check
  CHECK (age_rating IS NULL OR length(age_rating) <= 5);

-- 2. Cinemas ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cinemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 80),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 200),
  city text NOT NULL DEFAULT 'Almaty',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cinemas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cinemas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cinemas TO authenticated;
DROP POLICY IF EXISTS "public_read_cinemas" ON public.cinemas;
CREATE POLICY "public_read_cinemas" ON public.cinemas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins_manage_cinemas" ON public.cinemas;
CREATE POLICY "admins_manage_cinemas" ON public.cinemas FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Almaty cinemas (names and addresses from 2GIS, November 2026). Edit them in Admin > Cinemas.
INSERT INTO public.cinemas (id, name, address) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Kinopark 11 IMAX Esentai', 'Esentai Mall, 77/8 Al-Farabi Ave'),
  ('30000000-0000-4000-8000-000000000002', 'Chaplin MEGA Alma-Ata', 'MEGA Alma-Ata, 247a Rozybakiev St'),
  ('30000000-0000-4000-8000-000000000003', 'Chaplin MEGA Park', 'MEGA Park mall'),
  ('30000000-0000-4000-8000-000000000004', 'Cinemax Dostyk Multiplex', 'Dostyk Plaza mall'),
  ('30000000-0000-4000-8000-000000000005', 'Lumiera Cinema', 'TsUM, 62 Abylai Khan Ave'),
  ('30000000-0000-4000-8000-000000000006', 'Kinopark 4 Globus', 'Globus mall'),
  ('30000000-0000-4000-8000-000000000007', 'Kinopark 8 Moskva', 'MOSKVA Metropolitan, 37/1 8th microdistrict'),
  ('30000000-0000-4000-8000-000000000008', 'Arman', '104 Dostyk Ave'),
  ('30000000-0000-4000-8000-000000000009', 'Chaplin ADK', 'ADK mall, 90 Satpayev St')
ON CONFLICT DO NOTHING;

-- 3. Sessions = ticket tiers with a cinema and a time ------------------------------------------
ALTER TABLE public.ticket_tiers ADD COLUMN IF NOT EXISTS cinema_id uuid REFERENCES public.cinemas(id) ON DELETE RESTRICT;
ALTER TABLE public.ticket_tiers ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.ticket_tiers ADD COLUMN IF NOT EXISTS hall text;
ALTER TABLE public.ticket_tiers ADD COLUMN IF NOT EXISTS format text;
ALTER TABLE public.ticket_tiers ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.ticket_tiers DROP CONSTRAINT IF EXISTS ticket_tiers_session_check;
ALTER TABLE public.ticket_tiers ADD CONSTRAINT ticket_tiers_session_check
  CHECK (cinema_id IS NULL OR starts_at IS NOT NULL);
ALTER TABLE public.ticket_tiers DROP CONSTRAINT IF EXISTS ticket_tiers_session_text_check;
ALTER TABLE public.ticket_tiers ADD CONSTRAINT ticket_tiers_session_text_check
  CHECK (coalesce(length(hall), 0) <= 40 AND coalesce(length(format), 0) <= 20 AND coalesce(length(language), 0) <= 20);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_session ON public.ticket_tiers (event_id, starts_at) WHERE starts_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_cinema ON public.ticket_tiers (cinema_id) WHERE cinema_id IS NOT NULL;

-- When does what the customer bought actually start? The session time, else the event time.
CREATE OR REPLACE FUNCTION public.tier_starts_at(p_tier_id uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(t.starts_at, e.starts_at)
  FROM public.ticket_tiers t JOIN public.events e ON e.id = t.event_id
  WHERE t.id = p_tier_id;
$$;

-- 4. Ticket types (fares) ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tier_fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  price_kzt integer NOT NULL CHECK (price_kzt BETWEEN 0 AND 1000000),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 120),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (tier_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tier_fares_tier ON public.tier_fares (tier_id);

ALTER TABLE public.tier_fares ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tier_fares TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tier_fares TO authenticated;
DROP POLICY IF EXISTS "public_read_tier_fares" ON public.tier_fares;
CREATE POLICY "public_read_tier_fares" ON public.tier_fares FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins_manage_tier_fares" ON public.tier_fares;
CREATE POLICY "admins_manage_tier_fares" ON public.tier_fares FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. What the customer chose -------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS fare_lines jsonb NOT NULL DEFAULT '[]'::jsonb;
-- With mixed ticket types (2 adult + 1 child) one unit price no longer explains the total.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_total_matches;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_total_matches
  CHECK (jsonb_array_length(fare_lines) > 0 OR total_cents = unit_price_cents * quantity);

-- 6. Receipt JSON: session time, cinema, hall, ticket types --------------------------------------
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
    'event_id', e.id,
    'event_title', e.title,
    'event_venue', coalesce(c.name, e.venue),
    'event_city', coalesce(c.city, e.city),
    'event_starts_at', coalesce(t.starts_at, e.starts_at),
    'tier_name', t.name,
    'hall', t.hall,
    'format', t.format,
    'cinema_address', c.address,
    'fares', b.fare_lines,
    'seating', t.seating,
    'seat_labels', to_jsonb(b.seat_labels),
    'payment', (
      SELECT public._payment_json(p)
      FROM public.payments p
      WHERE p.booking_id = b.id
      ORDER BY (p.status = 'paid') DESC, p.created_at DESC
      LIMIT 1
    ),
    'refund_quote', CASE
      WHEN b.status = 'confirmed' AND pp.id IS NOT NULL THEN jsonb_build_object(
        'percent', public.refund_percent_for(coalesce(t.starts_at, e.starts_at)),
        'kzt', floor(pp.amount_kzt * public.refund_percent_for(coalesce(t.starts_at, e.starts_at)) / 100.0)::int)
      ELSE NULL END
  )
  FROM public.events e
  JOIN public.ticket_tiers t ON t.id = b.tier_id
  LEFT JOIN public.cinemas c ON c.id = t.cinema_id
  LEFT JOIN public.payments pp ON pp.booking_id = b.id AND pp.status = 'paid'
  WHERE e.id = b.event_id;
$$;

-- 7. Existing functions, now using the session time and refusing sessions with ticket types -----
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

  IF v_tier.seating = 'reserved' THEN
    RAISE EXCEPTION 'Please choose your seats for this ticket type.';
  END IF;


  IF EXISTS (SELECT 1 FROM public.tier_fares WHERE tier_id = v_tier.id) THEN
    RAISE EXCEPTION 'Please choose ticket types (adult, student, child) for this session.';
  END IF;

  v_starts := public.tier_starts_at(v_tier.id);
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

CREATE OR REPLACE FUNCTION public.create_booking_with_seats(
  p_tier_id uuid,
  p_seat_ids uuid[],
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
  v_qty integer := coalesce(cardinality(p_seat_ids), 0);
  v_found integer;
  v_labels text[];
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_rate numeric;
  v_hold integer;
  v_free boolean;
  v_booking public.bookings;
BEGIN
  IF v_qty < 1 OR v_qty > 10 THEN
    RAISE EXCEPTION 'Please choose between 1 and 10 seats.';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_seat_ids) AS x) <> v_qty THEN
    RAISE EXCEPTION 'Each seat can only be selected once.';
  END IF;
  IF length(v_name) = 0 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;

  -- Free the seats of unpaid bookings whose time is over, before checking what is taken.
  PERFORM public.release_expired_holds();

  -- Same lock order as create_booking: tier row first.
  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type no longer exists.';
  END IF;
  IF v_tier.seating <> 'reserved' THEN
    RAISE EXCEPTION 'This ticket type does not use seat selection.';
  END IF;


  IF EXISTS (SELECT 1 FROM public.tier_fares WHERE tier_id = v_tier.id) THEN
    RAISE EXCEPTION 'Please choose ticket types (adult, student, child) for this session.';
  END IF;

  v_starts := public.tier_starts_at(v_tier.id);
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This event has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM public.bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status IN ('confirmed', 'pending');
  IF v_already + v_qty > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  SELECT count(*), array_agg(s.row_label || s.seat_no::text ORDER BY s.row_no, s.seat_no)
  INTO v_found, v_labels
  FROM public.seats s
  WHERE s.id = ANY (p_seat_ids) AND s.tier_id = v_tier.id;
  IF v_found <> v_qty THEN
    RAISE EXCEPTION 'One or more seats do not belong to this ticket type.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seats s WHERE s.id = ANY (p_seat_ids) AND s.blocked)
     OR EXISTS (SELECT 1 FROM public.booking_seats bs WHERE bs.seat_id = ANY (p_seat_ids)) THEN
    RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
  END IF;

  IF v_tier.capacity - v_tier.sold < v_qty THEN
    RAISE EXCEPTION 'Only % seat(s) left for this option.', v_tier.capacity - v_tier.sold;
  END IF;

  SELECT value::numeric INTO v_rate FROM public.payment_settings WHERE key = 'kzt_per_usd';
  SELECT value::integer INTO v_hold FROM public.payment_settings WHERE key = 'hold_minutes';
  v_free := v_tier.price_cents = 0;

  UPDATE public.ticket_tiers SET sold = sold + v_qty WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, total_kzt,
    customer_name, customer_email, user_id, seat_labels,
    status, hold_expires_at
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, v_qty,
    v_tier.price_cents, v_tier.price_cents * v_qty,
    round(v_tier.price_cents * v_qty * v_rate / 100.0)::integer,
    v_name, v_email, auth.uid(), v_labels,
    CASE WHEN v_free THEN 'confirmed' ELSE 'pending' END,
    CASE WHEN v_free THEN NULL ELSE now() + make_interval(mins => coalesce(v_hold, 10)) END
  ) RETURNING * INTO v_booking;

  BEGIN
    INSERT INTO public.booking_seats (seat_id, booking_id)
    SELECT x, v_booking.id FROM unnest(p_seat_ids) AS x;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
  END;

  RETURN public._booking_json(v_booking);
END;
$$;

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
  v_seat_ids uuid[];
  v_seats_ok boolean := true;
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
    v_starts := public.tier_starts_at(v_booking.tier_id);
    IF cardinality(v_booking.seat_labels) > 0 THEN
      -- Seat booking: the same seats must still be free, otherwise the money goes back.
      SELECT array_agg(s.id) INTO v_seat_ids
      FROM public.seats s
      WHERE s.tier_id = v_booking.tier_id
        AND (s.row_label || s.seat_no::text) = ANY (v_booking.seat_labels)
        AND NOT s.blocked
        AND NOT EXISTS (SELECT 1 FROM public.booking_seats bs WHERE bs.seat_id = s.id);
      v_seats_ok := coalesce(cardinality(v_seat_ids), 0) = v_booking.quantity;
    END IF;

    IF v_starts > now() AND v_tier.capacity - v_tier.sold >= v_booking.quantity AND v_seats_ok THEN
      IF v_seat_ids IS NOT NULL THEN
        INSERT INTO public.booking_seats (seat_id, booking_id)
        SELECT x, v_booking.id FROM unnest(v_seat_ids) AS x;
      END IF;
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

  v_starts := public.tier_starts_at(b.tier_id);

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

-- 8. Booking with ticket types (seats optional) -------------------------------------------------
-- p_fares: [{"fare_id": "...", "quantity": 2}, {"fare_id": "...", "quantity": 1}]
-- Session with a seat map: p_seat_ids must hold exactly as many seats as tickets.
CREATE OR REPLACE FUNCTION public.create_fare_booking(
  p_tier_id uuid,
  p_seat_ids uuid[],
  p_fares jsonb,
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
  v_qty integer;
  v_total_kzt integer;
  v_lines jsonb;
  v_seat_count integer := coalesce(cardinality(p_seat_ids), 0);
  v_found integer;
  v_labels text[] := '{}';
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_rate numeric;
  v_hold integer;
  v_total_cents integer;
  v_free boolean;
  v_booking public.bookings;
BEGIN
  IF length(v_name) = 0 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;
  IF p_fares IS NULL OR jsonb_typeof(p_fares) <> 'array' OR jsonb_array_length(p_fares) = 0 THEN
    RAISE EXCEPTION 'Please choose at least one ticket.';
  END IF;

  PERFORM public.release_expired_holds();

  -- Same lock order as the other booking functions: tier row first.
  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That session no longer exists.';
  END IF;

  -- Read the chosen types. Each fare must belong to this session; a type may appear once.
  WITH wanted AS (
    SELECT (x ->> 'fare_id')::uuid AS fare_id, (x ->> 'quantity')::integer AS qty
    FROM jsonb_array_elements(p_fares) AS x
  )
  SELECT
    coalesce(sum(w.qty), 0),
    coalesce(sum(w.qty * f.price_kzt), 0),
    coalesce(jsonb_agg(jsonb_build_object('fare_id', f.id, 'name', f.name, 'quantity', w.qty, 'price_kzt', f.price_kzt)
             ORDER BY f.sort_order, f.name) FILTER (WHERE w.qty > 0), '[]'::jsonb),
    count(*) FILTER (WHERE f.id IS NULL OR w.qty IS NULL OR w.qty < 0),
    count(*) - count(DISTINCT w.fare_id)
  INTO v_qty, v_total_kzt, v_lines, v_found, v_already
  FROM wanted w
  LEFT JOIN public.tier_fares f ON f.id = w.fare_id AND f.tier_id = v_tier.id;

  IF v_found > 0 OR v_already > 0 THEN
    RAISE EXCEPTION 'Those ticket types do not belong to this session.';
  END IF;
  IF v_qty < 1 OR v_qty > 10 THEN
    RAISE EXCEPTION 'Please choose between 1 and 10 tickets.';
  END IF;

  v_starts := public.tier_starts_at(v_tier.id);
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This session has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM public.bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status IN ('confirmed', 'pending');
  IF v_already + v_qty > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  IF v_tier.seating = 'reserved' THEN
    IF v_seat_count <> v_qty THEN
      RAISE EXCEPTION 'Choose one ticket type for every seat (% seats, % tickets).', v_seat_count, v_qty;
    END IF;
    IF (SELECT count(DISTINCT x) FROM unnest(p_seat_ids) AS x) <> v_seat_count THEN
      RAISE EXCEPTION 'Each seat can only be selected once.';
    END IF;
    SELECT count(*), array_agg(s.row_label || s.seat_no::text ORDER BY s.row_no, s.seat_no)
    INTO v_found, v_labels
    FROM public.seats s
    WHERE s.id = ANY (p_seat_ids) AND s.tier_id = v_tier.id;
    IF v_found <> v_seat_count THEN
      RAISE EXCEPTION 'One or more seats do not belong to this session.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.seats s WHERE s.id = ANY (p_seat_ids) AND s.blocked)
       OR EXISTS (SELECT 1 FROM public.booking_seats bs WHERE bs.seat_id = ANY (p_seat_ids)) THEN
      RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
    END IF;
  ELSIF v_seat_count > 0 THEN
    RAISE EXCEPTION 'This session does not use seat selection.';
  END IF;

  IF v_tier.capacity - v_tier.sold < v_qty THEN
    RAISE EXCEPTION 'Only % seat(s) left for this session.', v_tier.capacity - v_tier.sold;
  END IF;

  SELECT value::numeric INTO v_rate FROM public.payment_settings WHERE key = 'kzt_per_usd';
  SELECT value::integer INTO v_hold FROM public.payment_settings WHERE key = 'hold_minutes';
  -- Prices of ticket types are in tenge; the catalogue keeps USD cents for reports.
  v_total_cents := round(v_total_kzt * 100.0 / v_rate)::integer;
  v_free := v_total_kzt = 0;

  UPDATE public.ticket_tiers SET sold = sold + v_qty WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, total_kzt, fare_lines,
    customer_name, customer_email, user_id, seat_labels,
    status, hold_expires_at
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, v_qty,
    round(v_total_cents::numeric / v_qty)::integer, v_total_cents, v_total_kzt, v_lines,
    v_name, v_email, auth.uid(), coalesce(v_labels, '{}'),
    CASE WHEN v_free THEN 'confirmed' ELSE 'pending' END,
    CASE WHEN v_free THEN NULL ELSE now() + make_interval(mins => coalesce(v_hold, 10)) END
  ) RETURNING * INTO v_booking;

  IF v_seat_count > 0 THEN
    BEGIN
      INSERT INTO public.booking_seats (seat_id, booking_id)
      SELECT x, v_booking.id FROM unnest(p_seat_ids) AS x;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
    END;
  END IF;

  RETURN public._booking_json(v_booking);
END;
$$;

-- 9. Admin: create / delete a session in one step ----------------------------------------------
-- p_fares: [{"name": "Adult", "price_kzt": 2500, "note": ""}, ...]
-- p_seats_per_row set  -> seat map of p_rows x p_seats_per_row seats.
-- p_seats_per_row null -> no seat map, p_capacity tickets.
CREATE OR REPLACE FUNCTION public.admin_create_session(
  p_event_id uuid,
  p_cinema_id uuid,
  p_starts_at timestamptz,
  p_hall text,
  p_format text,
  p_language text,
  p_rows integer,
  p_seats_per_row integer,
  p_capacity integer,
  p_fares jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier_id uuid;
  v_capacity integer;
  v_min_kzt integer;
  v_rate numeric;
  v_hall text := nullif(trim(coalesce(p_hall, '')), '');
  v_format text := coalesce(nullif(trim(coalesce(p_format, '')), ''), '2D');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Movie not found.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cinemas WHERE id = p_cinema_id) THEN
    RAISE EXCEPTION 'Cinema not found.';
  END IF;
  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'Choose the session date and time.';
  END IF;
  IF p_fares IS NULL OR jsonb_typeof(p_fares) <> 'array' OR jsonb_array_length(p_fares) = 0 THEN
    RAISE EXCEPTION 'Add at least one ticket type with a price.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ticket_tiers
    WHERE event_id = p_event_id AND cinema_id = p_cinema_id AND starts_at = p_starts_at
      AND coalesce(hall, '') = coalesce(v_hall, '')
  ) THEN
    RAISE EXCEPTION 'This session already exists (same cinema, hall and time).';
  END IF;

  IF p_seats_per_row IS NOT NULL THEN
    IF p_rows IS NULL OR p_rows < 1 OR p_rows > 30 THEN
      RAISE EXCEPTION 'Rows must be between 1 and 30.';
    END IF;
    v_capacity := p_rows * p_seats_per_row;
  ELSE
    v_capacity := p_capacity;
  END IF;
  IF v_capacity IS NULL OR v_capacity < 1 OR v_capacity > 600 THEN
    RAISE EXCEPTION 'A session needs between 1 and 600 seats.';
  END IF;

  SELECT min((x ->> 'price_kzt')::integer) INTO v_min_kzt FROM jsonb_array_elements(p_fares) AS x;
  SELECT value::numeric INTO v_rate FROM public.payment_settings WHERE key = 'kzt_per_usd';

  INSERT INTO public.ticket_tiers (
    event_id, name, description, price_cents, capacity,
    cinema_id, starts_at, hall, format, language
  ) VALUES (
    p_event_id,
    concat_ws(' · ', v_hall, v_format),
    coalesce(nullif(trim(coalesce(p_language, '')), ''), ''),
    round(coalesce(v_min_kzt, 0) * 100.0 / v_rate)::integer,
    v_capacity,
    p_cinema_id, p_starts_at, v_hall, v_format, nullif(trim(coalesce(p_language, '')), '')
  ) RETURNING id INTO v_tier_id;

  INSERT INTO public.tier_fares (tier_id, name, price_kzt, note, sort_order)
  SELECT v_tier_id, trim(x ->> 'name'), (x ->> 'price_kzt')::integer, coalesce(x ->> 'note', ''), ord::integer
  FROM jsonb_array_elements(p_fares) WITH ORDINALITY AS a(x, ord);

  IF p_seats_per_row IS NOT NULL THEN
    PERFORM public.generate_tier_seats(v_tier_id, p_seats_per_row);
  END IF;

  RETURN v_tier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_session(p_tier_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE tier_id = p_tier_id) THEN
    RAISE EXCEPTION 'People have already booked this session, so it cannot be deleted.';
  END IF;
  DELETE FROM public.seats WHERE tier_id = p_tier_id;
  DELETE FROM public.ticket_tiers WHERE id = p_tier_id AND starts_at IS NOT NULL;
END;
$$;

-- 10. Permissions --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._booking_json(public.bookings) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._cancel_booking_row(public.bookings) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tier_starts_at(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.create_booking(uuid, integer, text, text),
  public.create_booking_with_seats(uuid, uuid[], text, text),
  public.create_fare_booking(uuid, uuid[], jsonb, text, text),
  public.confirm_payment(uuid, text, integer, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.create_booking(uuid, integer, text, text),
  public.create_booking_with_seats(uuid, uuid[], text, text),
  public.create_fare_booking(uuid, uuid[], jsonb, text, text),
  public.confirm_payment(uuid, text, integer, text)
TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.admin_create_session(uuid, uuid, timestamptz, text, text, text, integer, integer, integer, jsonb),
  public.admin_delete_session(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_create_session(uuid, uuid, timestamptz, text, text, text, integer, integer, integer, jsonb),
  public.admin_delete_session(uuid)
TO authenticated;
