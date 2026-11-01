/*
# Create ticket booking system (events, ticket types, bookings)

1. New Tables
- `events`: public listings with title, description, category, venue, city, start time, and image.
- `ticket_tiers`: ticket types per event with price (in cents), total capacity, and tickets sold.
- `bookings`: confirmed purchases with a short booking code, buyer name and email, quantity and totals.

2. Security
- RLS enabled on all three tables.
- `events` and `ticket_tiers` are publicly readable (anon and signed-in roles), read-only.
- `bookings` has no direct table access. Customers interact only through two functions:
  - `create_booking` checks and updates capacity under a row lock, so tickets can never be oversold.
  - `get_booking` returns a booking only when both the booking code and the email match.
- Functions are revoked from PUBLIC and granted only to anon and authenticated.

3. Seed data
- Six sample events with ticket types, using fixed IDs so re-running this migration does nothing new.

4. Notes
- Quantity is limited to 1-10 tickets per booking.
- Deleting an event is blocked while bookings exist for it (bookings use ON DELETE RESTRICT).
*/

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General',
  venue text NOT NULL,
  city text NOT NULL,
  starts_at timestamptz NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  capacity integer NOT NULL CHECK (capacity >= 0),
  sold integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sold <= capacity)
);

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text NOT NULL UNIQUE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  tier_id uuid NOT NULL REFERENCES ticket_tiers(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tier_id ON bookings(tier_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON events TO anon, authenticated;
GRANT SELECT ON ticket_tiers TO anon, authenticated;

DROP POLICY IF EXISTS "public_select_events" ON events;
CREATE POLICY "public_select_events" ON events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_select_ticket_tiers" ON ticket_tiers;
CREATE POLICY "public_select_ticket_tiers" ON ticket_tiers FOR SELECT
  TO anon, authenticated USING (true);

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

REVOKE EXECUTE ON FUNCTION get_booking(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_booking(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_booking(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_booking(uuid, integer, text, text) TO anon, authenticated;

INSERT INTO events (id, title, description, category, venue, city, starts_at, image_url) VALUES
('20000000-0000-4000-8000-000000000001', 'Midnight Jazz Collective', 'An intimate night of smooth jazz standards and original compositions from one of the city''s most loved ensembles. Settle in with a cocktail and let the saxophone carry you away.', 'Music', 'Blue Note Lounge', 'New York', '2026-11-14 20:00:00+00', 'https://images.pexels.com/photos/9419224/pexels-photo-9419224.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
('20000000-0000-4000-8000-000000000002', 'Northern Lights Symphony', 'The full orchestra performs an evening of Sibelius, Grieg and a world premiere commissioned for the winter season.', 'Classical', 'Royal Concert Hall', 'London', '2026-12-05 19:30:00+00', 'https://images.pexels.com/photos/5182979/pexels-photo-5182979.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
('20000000-0000-4000-8000-000000000003', 'Neon Nights Festival', 'Two days of electronic, indie and hip-hop acts across three stages by the river. Food trucks, art installations and a closing fireworks show.', 'Festival', 'Riverside Park', 'Austin', '2026-11-28 16:00:00+00', 'https://images.pexels.com/photos/32399568/pexels-photo-32399568.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
('20000000-0000-4000-8000-000000000004', 'The Glass Menagerie', 'A striking revival of Tennessee Williams'' classic memory play, staged in the intimate Lakeside Playhouse with a cast of seven.', 'Theatre', 'Lakeside Playhouse', 'Toronto', '2026-11-20 19:00:00+00', 'https://images.pexels.com/photos/6899776/pexels-photo-6899776.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
('20000000-0000-4000-8000-000000000005', 'Future Stack Summit', 'A one-day conference on modern web architecture, AI tooling and developer productivity, with talks, workshops and a hands-on lab.', 'Conference', 'Convention Center Hall A', 'Berlin', '2026-12-10 09:00:00+00', 'https://images.pexels.com/photos/9275222/pexels-photo-9275222.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
('20000000-0000-4000-8000-000000000006', 'Riverside Derby: Lions vs Falcons', 'The city rivalry is back. Join thousands of fans under the floodlights for a high-stakes league match.', 'Sports', 'Riverside Stadium', 'Manchester', '2026-11-22 15:00:00+00', 'https://images.pexels.com/photos/35898730/pexels-photo-35898730.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_tiers (id, event_id, name, description, price_cents, capacity, sold) VALUES
('10000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001', 'General Admission', 'Standing room near the bar', 4500, 120, 45),
('10000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-000000000001', 'VIP Table', 'Reserved table for four with bottle service', 9500, 30, 12),
('10000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000002', 'Stalls', 'Premium seating in the central stalls', 8500, 200, 150),
('10000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000002', 'Circle', 'Elevated seats with a full view of the stage', 5500, 300, 80),
('10000000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-000000000002', 'Gallery', 'Budget-friendly seats in the upper gallery', 2500, 150, 20),
('10000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000003', 'Day Pass', 'Entry for one full day of performances', 6000, 500, 210),
('10000000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-000000000003', 'Weekend Pass', 'Both days plus the closing fireworks', 13500, 300, 180),
('10000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000004', 'Standard', 'Side and rear stalls', 3500, 90, 60),
('10000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000004', 'Premium', 'Front-row seats close to the stage', 6000, 40, 38),
('10000000-0000-4000-8000-000000000501', '20000000-0000-4000-8000-000000000005', 'Conference Pass', 'Access to all talks and the expo floor', 29900, 400, 120),
('10000000-0000-4000-8000-000000000502', '20000000-0000-4000-8000-000000000005', 'Workshop Bundle', 'Conference pass plus one hands-on workshop', 49900, 60, 25),
('10000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000006', 'Upper Stand', 'Covered upper stand with a great view', 3000, 2000, 1200),
('10000000-0000-4000-8000-000000000602', '20000000-0000-4000-8000-000000000006', 'Lower Stand', 'Close to the pitch with the home crowd', 7500, 800, 790)
ON CONFLICT (id) DO NOTHING;
