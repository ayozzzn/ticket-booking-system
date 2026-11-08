/*
# get_my_bookings: include status, cancelled_at and customer_email  (OPTIONAL)

Before running, look at the current function written by your teammate:
  SELECT pg_get_functiondef('public.get_my_bookings'::regproc);
If its JSON already contains 'status' and 'cancelled_at', SKIP this file.

Returns only the signed-in user's bookings (matched by the email in their login token).
Make sure "Confirm email" is ON in Supabase Authentication settings; otherwise someone could
register with another person's email and see their bookings.
*/
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
    AND lower(b.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings() TO authenticated;
