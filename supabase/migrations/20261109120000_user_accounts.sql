/*
# User accounts: profiles, bookings linked to users, cancel from the profile

Run AFTER all previous migrations (including the admin ones). Safe to run more than once.

1. profiles
- One row per auth user (created automatically by a trigger on auth.users).
- A user can read their own profile and change only full_name.

2. bookings.user_id
- Bookings made while logged in are linked to the account (create_booking reads auth.uid()).
- Old guest bookings are linked by email if that email belongs to a registered user.

3. Functions for the profile page
- get_my_bookings(): the signed-in user's bookings (by user_id, or by email for old guest bookings).
- cancel_my_booking(code): cancel one of MY bookings without typing the email again.
*/

-- 1. Profiles -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text NOT NULL DEFAULT '' CHECK (length(full_name) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Create the profile automatically when someone signs up.
-- The trigger never blocks sign-up: on any error it only logs a warning.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, left(coalesce(NEW.raw_user_meta_data ->> 'full_name', ''), 120))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profiles for users who registered before this migration.
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 120)
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 2. Link bookings to users -----------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings (user_id);

UPDATE public.bookings b
SET user_id = u.id
FROM auth.users u
WHERE b.user_id IS NULL
  AND u.email_confirmed_at IS NOT NULL
  AND lower(u.email) = b.customer_email;

-- create_booking: same rules as before, plus user_id = auth.uid() (NULL for guests).
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
    unit_price_cents, total_cents, customer_name, customer_email, user_id
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, p_quantity,
    v_tier.price_cents, v_tier.price_cents * p_quantity, v_name, v_email, auth.uid()
  );

  RETURN public.get_booking(v_code, v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_booking(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_booking(uuid, integer, text, text) TO anon, authenticated;

-- 3. Profile page functions -----------------------------------------------------
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
        'tier_name', t.name
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

CREATE OR REPLACE FUNCTION public.cancel_my_booking(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_starts timestamptz;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please log in to manage your bookings.';
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE booking_code = upper(trim(p_code))
    AND (user_id = auth.uid() OR (user_id IS NULL AND customer_email = v_email))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking with that code was found in your account.';
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

  RETURN public.get_booking(v_booking.booking_code, v_booking.customer_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_bookings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_my_booking(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_booking(text) TO authenticated;
