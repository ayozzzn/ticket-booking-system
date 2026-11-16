/*
# Database improvements: integrity, cancellation, anti-hoarding, analytics

1. Integrity
- A booking's event must match its ticket tier's event (composite foreign key).
- CHECK constraints: total = unit price x quantity, quantity 1-10, valid lowercase email, non-blank names.

2. Cancellation
- `bookings.status` ('confirmed' | 'cancelled') and `cancelled_at`.
- New function `cancel_booking(code, email)` returns tickets to the tier under a row lock.

3. Business rules inside the database
- `create_booking` now rejects events that already started and limits one email to 10 tickets per event.
- `get_booking` now also returns status and cancelled_at.

4. Data quality / analytics
- `ticket_tiers.baseline_sold`: tickets sold outside the system (seed data) so counters can be audited.
- View `v_sold_integrity`: checks that `sold` = baseline + confirmed bookings.
- View `v_event_stats`: capacity, tickets sold, occupancy, revenue per event.
- Both views are revoked from anon/authenticated (they expose booking data).

5. Performance
- Indexes on events(starts_at) and bookings(customer_email).

Run this AFTER the original migration. Safe to run more than once.
*/

-- 1. Referential consistency --------------------------------------------------
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_tier_event_fk;
ALTER TABLE ticket_tiers DROP CONSTRAINT IF EXISTS ticket_tiers_id_event_key;
ALTER TABLE ticket_tiers ADD CONSTRAINT ticket_tiers_id_event_key UNIQUE (id, event_id);
ALTER TABLE bookings ADD CONSTRAINT bookings_tier_event_fk
  FOREIGN KEY (tier_id, event_id) REFERENCES ticket_tiers (id, event_id) ON DELETE RESTRICT;

-- 2. Booking status -------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('confirmed', 'cancelled'));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancel_consistency;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancel_consistency
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL));

-- 3. Data quality constraints ---------------------------------------------------
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_total_matches;
ALTER TABLE bookings ADD CONSTRAINT bookings_total_matches CHECK (total_cents = unit_price_cents * quantity);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_quantity_max;
ALTER TABLE bookings ADD CONSTRAINT bookings_quantity_max CHECK (quantity BETWEEN 1 AND 10);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_email_format;
ALTER TABLE bookings ADD CONSTRAINT bookings_email_format
  CHECK (customer_email = lower(customer_email) AND customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_name_not_blank;
ALTER TABLE bookings ADD CONSTRAINT bookings_name_not_blank CHECK (length(trim(customer_name)) > 0);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_title_not_blank;
ALTER TABLE events ADD CONSTRAINT events_title_not_blank CHECK (length(trim(title)) > 0);

-- 4. Baseline sold counter (tickets sold before the system existed / seed data) --
ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS baseline_sold integer NOT NULL DEFAULT 0
  CHECK (baseline_sold >= 0);

UPDATE ticket_tiers t
SET baseline_sold = GREATEST(
  t.sold - COALESCE((SELECT SUM(b.quantity) FROM bookings b
                     WHERE b.tier_id = t.id AND b.status = 'confirmed'), 0), 0)
WHERE t.baseline_sold = 0;

-- 5. Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events (starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_email ON bookings (customer_email);

-- 6. Functions -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_booking(p_code text, p_email text)
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
    'tier_name', t.name
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

CREATE OR REPLACE FUNCTION create_booking(
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
    unit_price_cents, total_cents, customer_name, customer_email
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, p_quantity,
    v_tier.price_cents, v_tier.price_cents * p_quantity, v_name, v_email
  );

  RETURN public.get_booking(v_code, v_email);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_booking(p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_starts timestamptz;
BEGIN
  SELECT * INTO v_booking
  FROM bookings
  WHERE booking_code = upper(trim(p_code))
    AND lower(customer_email) = lower(trim(p_email))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking matches that code and email.';
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking is already cancelled.';
  END IF;

  SELECT starts_at INTO v_starts FROM events WHERE id = v_booking.event_id;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'Bookings for events that already started cannot be cancelled.';
  END IF;

  UPDATE ticket_tiers SET sold = sold - v_booking.quantity WHERE id = v_booking.tier_id;
  UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = v_booking.id;

  RETURN public.get_booking(p_code, p_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_booking(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_booking(text, text) TO anon, authenticated;

-- 7. Audit and analytics views (private: queried from the SQL editor / admin only) --
CREATE OR REPLACE VIEW v_sold_integrity AS
SELECT
  t.id AS tier_id,
  e.title AS event_title,
  t.name AS tier_name,
  t.sold AS recorded_sold,
  t.baseline_sold,
  COALESCE(SUM(b.quantity) FILTER (WHERE b.status = 'confirmed'), 0)::int AS confirmed_quantity,
  (t.sold = t.baseline_sold + COALESCE(SUM(b.quantity) FILTER (WHERE b.status = 'confirmed'), 0)) AS is_consistent
FROM ticket_tiers t
JOIN events e ON e.id = t.event_id
LEFT JOIN bookings b ON b.tier_id = t.id
GROUP BY t.id, e.title, t.name, t.sold, t.baseline_sold;

CREATE OR REPLACE VIEW v_event_stats AS
SELECT
  e.id AS event_id,
  e.title,
  e.category,
  e.city,
  e.starts_at,
  COALESCE(SUM(t.capacity), 0)::int AS capacity,
  COALESCE(SUM(t.sold), 0)::int AS tickets_sold,
  ROUND(100.0 * COALESCE(SUM(t.sold), 0) / NULLIF(SUM(t.capacity), 0), 1) AS occupancy_pct,
  COALESCE((SELECT SUM(b.total_cents) FROM bookings b
            WHERE b.event_id = e.id AND b.status = 'confirmed'), 0)::bigint AS booked_revenue_cents,
  (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id AND b.status = 'confirmed')::int AS confirmed_bookings,
  (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id AND b.status = 'cancelled')::int AS cancelled_bookings
FROM events e
LEFT JOIN ticket_tiers t ON t.event_id = e.id
GROUP BY e.id, e.title, e.category, e.city, e.starts_at;

REVOKE ALL ON v_sold_integrity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON v_event_stats FROM PUBLIC, anon, authenticated;
