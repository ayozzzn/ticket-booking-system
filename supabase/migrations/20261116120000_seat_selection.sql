/*
# Seat selection (reserved seating)

Run AFTER all previous migrations (including 20261109120000_user_accounts.sql).
Safe to run more than once, except the seed block at the bottom (it skips tiers that already have seats).

1. ticket_tiers.seating: 'general' (as before, just a quantity) or 'reserved' (customer picks seats).
2. seats: one row per seat of a reserved tier. `blocked` = sold before the seat map existed.
3. booking_seats: which seat belongs to which ACTIVE booking. seat_id is the PRIMARY KEY,
   so the same seat can never be booked twice, even if two buyers click at the same moment.
4. bookings.seat_labels: readable snapshot ("C7", "C8") kept after cancellation for history.
5. Functions
   - get_tier_seats(tier)                  -> seat map with a `taken` flag (no personal data)
   - create_booking_with_seats(...)        -> books the chosen seats under the tier row lock
   - create_booking(...)                   -> unchanged, but refuses reserved tiers
   - get_booking / get_my_bookings         -> now also return seat_labels
   - generate_tier_seats(tier, per_row)    -> owner-only helper that builds the seat map
6. Trigger release_seats_on_cancel: cancelling a booking frees its seats automatically,
   so cancel_booking and cancel_my_booking do not need to change.

Rule that keeps counters honest:  sold = blocked seats + seats held by confirmed bookings.
*/

-- 1. Tier setting ---------------------------------------------------------------
ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS seating text NOT NULL DEFAULT 'general';
ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS seats_per_row integer;

ALTER TABLE public.ticket_tiers DROP CONSTRAINT IF EXISTS ticket_tiers_seating_check;
ALTER TABLE public.ticket_tiers
  ADD CONSTRAINT ticket_tiers_seating_check CHECK (seating IN ('general', 'reserved'));

-- 2. Seats ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  row_no integer NOT NULL CHECK (row_no > 0),
  row_label text NOT NULL,
  seat_no integer NOT NULL CHECK (seat_no > 0),
  blocked boolean NOT NULL DEFAULT false,
  UNIQUE (tier_id, row_no, seat_no)
);
CREATE INDEX IF NOT EXISTS idx_seats_tier_id ON public.seats (tier_id);

-- 3. Seats held by active bookings ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_seats (
  seat_id uuid PRIMARY KEY REFERENCES public.seats(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_booking_seats_booking_id ON public.booking_seats (booking_id);

-- Nobody reads these tables directly: customers only use the functions below.
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_seats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.booking_seats FROM PUBLIC, anon, authenticated;

-- 4. Seat labels on bookings ------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS seat_labels text[] NOT NULL DEFAULT '{}';

-- 5a. Helper: 1 -> A, 26 -> Z, 27 -> AA ------------------------------------------
CREATE OR REPLACE FUNCTION public.seat_row_label(p_row integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n integer := p_row;
  s text := '';
BEGIN
  WHILE n > 0 LOOP
    n := n - 1;
    s := chr(65 + (n % 26)) || s;
    n := n / 26;
  END LOOP;
  RETURN s;
END;
$$;

-- 5b. Build the seat map for one tier (owner only: run it from the SQL editor) -----
CREATE OR REPLACE FUNCTION public.generate_tier_seats(p_tier_id uuid, p_seats_per_row integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier ticket_tiers%ROWTYPE;
BEGIN
  IF p_seats_per_row IS NULL OR p_seats_per_row < 1 OR p_seats_per_row > 30 THEN
    RAISE EXCEPTION 'Seats per row must be between 1 and 30.';
  END IF;

  SELECT * INTO v_tier FROM ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found.';
  END IF;
  IF v_tier.capacity > 600 THEN
    RAISE EXCEPTION 'Seat maps are limited to 600 seats per ticket type.';
  END IF;
  IF EXISTS (SELECT 1 FROM seats WHERE tier_id = p_tier_id) THEN
    RAISE EXCEPTION 'This ticket type already has a seat map.';
  END IF;

  INSERT INTO seats (tier_id, row_no, row_label, seat_no)
  SELECT
    v_tier.id,
    ((g - 1) / p_seats_per_row) + 1,
    public.seat_row_label(((g - 1) / p_seats_per_row) + 1),
    ((g - 1) % p_seats_per_row) + 1
  FROM generate_series(1, v_tier.capacity) AS g;

  -- Tickets that were already sold (seed data / old bookings) have no seat yet:
  -- block that many random seats so that  capacity - sold  still equals the free seats.
  UPDATE seats SET blocked = true
  WHERE id IN (
    SELECT id FROM seats WHERE tier_id = p_tier_id ORDER BY random() LIMIT v_tier.sold
  );

  UPDATE ticket_tiers
  SET seating = 'reserved', seats_per_row = p_seats_per_row
  WHERE id = p_tier_id;

  RETURN v_tier.capacity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tier_seats(uuid, integer) FROM PUBLIC, anon, authenticated;

-- 5c. Seat map for the website -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tier_seats(p_tier_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'row', s.row_label,
        'row_no', s.row_no,
        'seat', s.seat_no,
        'taken', (s.blocked OR bs.seat_id IS NOT NULL)
      )
      ORDER BY s.row_no, s.seat_no
    ),
    '[]'::jsonb
  )
  FROM seats s
  LEFT JOIN booking_seats bs ON bs.seat_id = s.id
  WHERE s.tier_id = p_tier_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tier_seats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tier_seats(uuid) TO anon, authenticated;

-- 5d. get_booking now returns seat_labels --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking(p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'booking_code', b.booking_code,
    'status', b.status,
    'cancelled_at', b.cancelled_at,
    'customer_name', b.customer_name,
    'customer_email', b.customer_email,
    'quantity', b.quantity,
    'total_cents', b.total_cents,
    'unit_price_cents', b.unit_price_cents,
    'created_at', b.created_at,
    'event_title', e.title,
    'event_venue', e.venue,
    'event_city', e.city,
    'event_starts_at', e.starts_at,
    'tier_name', t.name,
    'seat_labels', to_jsonb(b.seat_labels)
  )
  INTO v_result
  FROM bookings b
  JOIN events e ON e.id = b.event_id
  JOIN ticket_tiers t ON t.id = b.tier_id
  WHERE b.booking_code = upper(trim(p_code))
    AND lower(b.customer_email) = lower(trim(p_email));

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_booking(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking(text, text) TO anon, authenticated;

-- 5e. get_my_bookings now returns seat_labels ------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_bookings();

CREATE FUNCTION public.get_my_bookings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'booking_code', b.booking_code,
        'status', b.status,
        'cancelled_at', b.cancelled_at,
        'customer_name', b.customer_name,
        'customer_email', b.customer_email,
        'quantity', b.quantity,
        'total_cents', b.total_cents,
        'unit_price_cents', b.unit_price_cents,
        'created_at', b.created_at,
        'event_title', e.title,
        'event_venue', e.venue,
        'event_city', e.city,
        'event_starts_at', e.starts_at,
        'tier_name', t.name,
        'seat_labels', to_jsonb(b.seat_labels)
      )
      ORDER BY b.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM bookings b
  JOIN events e ON e.id = b.event_id
  JOIN ticket_tiers t ON t.id = b.tier_id
  WHERE auth.uid() IS NOT NULL
    AND (
      b.user_id = auth.uid()
      OR (b.user_id IS NULL
          AND b.customer_email = lower(coalesce(auth.jwt() ->> 'email', '')))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings() TO authenticated;

-- 5f. create_booking: same as before, but reserved tiers must use the seat function -----
CREATE OR REPLACE FUNCTION public.create_booking(
  p_tier_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier ticket_tiers%ROWTYPE;
  v_starts timestamptz;
  v_already integer;
  v_code text;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
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

  SELECT * INTO v_tier FROM ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type no longer exists.';
  END IF;
  IF v_tier.seating = 'reserved' THEN
    RAISE EXCEPTION 'Please choose your seats for this ticket type.';
  END IF;

  SELECT starts_at INTO v_starts FROM events WHERE id = v_tier.event_id;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This event has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status = 'confirmed';
  IF v_already + p_quantity > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  IF v_tier.capacity - v_tier.sold < p_quantity THEN
    RAISE EXCEPTION 'Only % ticket(s) left for this option.', v_tier.capacity - v_tier.sold;
  END IF;

  UPDATE ticket_tiers SET sold = sold + p_quantity WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, customer_name, customer_email, user_id
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, p_quantity,
    v_tier.price_cents, v_tier.price_cents * p_quantity, v_name, v_email, auth.uid()
  );

  RETURN public.get_booking(v_code, v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, integer, text, text) TO anon, authenticated;

-- 5g. create_booking_with_seats ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_with_seats(
  p_tier_id uuid,
  p_seat_ids uuid[],
  p_customer_name text,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier ticket_tiers%ROWTYPE;
  v_starts timestamptz;
  v_already integer;
  v_code text;
  v_booking_id uuid;
  v_qty integer := coalesce(cardinality(p_seat_ids), 0);
  v_found integer;
  v_labels text[];
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
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

  -- Same lock order as create_booking: tier row first.
  SELECT * INTO v_tier FROM ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type no longer exists.';
  END IF;
  IF v_tier.seating <> 'reserved' THEN
    RAISE EXCEPTION 'This ticket type does not use seat selection.';
  END IF;

  SELECT starts_at INTO v_starts FROM events WHERE id = v_tier.event_id;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This event has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status = 'confirmed';
  IF v_already + v_qty > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  SELECT count(*), array_agg(s.row_label || s.seat_no::text ORDER BY s.row_no, s.seat_no)
  INTO v_found, v_labels
  FROM seats s
  WHERE s.id = ANY (p_seat_ids) AND s.tier_id = v_tier.id;

  IF v_found <> v_qty THEN
    RAISE EXCEPTION 'One or more seats do not belong to this ticket type.';
  END IF;

  IF EXISTS (SELECT 1 FROM seats s WHERE s.id = ANY (p_seat_ids) AND s.blocked)
     OR EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = ANY (p_seat_ids)) THEN
    RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
  END IF;

  IF v_tier.capacity - v_tier.sold < v_qty THEN
    RAISE EXCEPTION 'Only % seat(s) left for this option.', v_tier.capacity - v_tier.sold;
  END IF;

  UPDATE ticket_tiers SET sold = sold + v_qty WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, customer_name, customer_email, user_id, seat_labels
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, v_qty,
    v_tier.price_cents, v_tier.price_cents * v_qty, v_name, v_email, auth.uid(), v_labels
  )
  RETURNING id INTO v_booking_id;

  BEGIN
    INSERT INTO booking_seats (seat_id, booking_id)
    SELECT x, v_booking_id FROM unnest(p_seat_ids) AS x;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
  END;

  RETURN public.get_booking(v_code, v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking_with_seats(uuid, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_with_seats(uuid, uuid[], text, text) TO anon, authenticated;

-- 6. Cancelling a booking frees its seats --------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_seats_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    DELETE FROM booking_seats WHERE booking_id = NEW.id;

    -- Booking made before the seat map existed: it holds no seat rows, so free the same
    -- number of blocked seats. Keeps  sold = blocked + booked  true.
    IF cardinality(NEW.seat_labels) = 0 THEN
      UPDATE seats SET blocked = false
      WHERE id IN (
        SELECT id FROM seats WHERE tier_id = NEW.tier_id AND blocked LIMIT NEW.quantity
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_seats_on_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_release_seats_on_cancel ON public.bookings;
CREATE TRIGGER trg_release_seats_on_cancel
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.release_seats_on_cancel();

-- 7. Seed: reserved seating for two sample events ------------------------------------------
-- Northern Lights Symphony (Stalls, Circle, Gallery) and The Glass Menagerie (Standard).
-- Tiers that already have seats are skipped, so this block is safe to re-run.
-- To enable seats on another tier later:  SELECT public.generate_tier_seats('<tier uuid>', 10);
DO $$
DECLARE
  v_tier uuid;
BEGIN
  FOREACH v_tier IN ARRAY ARRAY[
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000202',
    '10000000-0000-4000-8000-000000000203',
    '10000000-0000-4000-8000-000000000401'
  ]::uuid[]
  LOOP
    IF EXISTS (SELECT 1 FROM ticket_tiers WHERE id = v_tier)
       AND NOT EXISTS (SELECT 1 FROM seats WHERE tier_id = v_tier) THEN
      PERFORM public.generate_tier_seats(v_tier, 10);
    END IF;
  END LOOP;
END
$$;
