/*
  Admin panel security self-test. Run in the Supabase SQL editor AFTER:
  both admin migrations are applied AND at least one row exists in admin_users.
  "Success" = all checks passed. A failure names the broken rule.
  All test data is rolled back.
*/
DO $$
DECLARE
  v_admin uuid;
  failed boolean;
  v_event uuid;
BEGIN
  SELECT user_id INTO v_admin FROM public.admin_users LIMIT 1;
  ASSERT v_admin IS NOT NULL, 'Setup: admin_users is empty - add the admin first';

  BEGIN  -- rolled back by the sentinel at the end

    -- A: anonymous visitor cannot create events
    SET LOCAL ROLE anon;
    failed := false;
    BEGIN
      INSERT INTO public.events (title, venue, city, starts_at)
      VALUES ('anon hack', 'x', 'y', now() + interval '1 day');
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    RESET ROLE;
    ASSERT failed, 'A: anon must not create events';

    -- B: signed-in user who is NOT an admin
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    failed := false;
    BEGIN
      INSERT INTO public.events (title, venue, city, starts_at)
      VALUES ('user hack', 'x', 'y', now() + interval '1 day');
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'B1: non-admin must not create events';
    ASSERT (SELECT count(*) FROM public.bookings) = 0, 'B2: non-admin must not read bookings';
    ASSERT NOT public.is_admin(), 'B3: is_admin() must be false for a non-admin';
    failed := false;
    BEGIN PERFORM * FROM public.admin_event_stats(); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'B4: non-admin must not read admin statistics';
    RESET ROLE;

    -- C: the real admin can manage events and read statistics
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    ASSERT public.is_admin(), 'C1: is_admin() must be true for the admin';
    INSERT INTO public.events (title, venue, city, starts_at)
    VALUES ('admin test event', 'Hall', 'Almaty', now() + interval '7 days')
    RETURNING id INTO v_event;
    INSERT INTO public.ticket_tiers (event_id, name, price_cents, capacity)
    VALUES (v_event, 'Standard', 1000, 10);
    PERFORM * FROM public.admin_event_stats();

    -- D: even the admin cannot hand-edit the sold counter
    failed := false;
    BEGIN
      UPDATE public.ticket_tiers SET sold = 5 WHERE event_id = v_event;
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'D: admin must not edit ticket_tiers.sold by hand';
    RESET ROLE;

    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'rollback test data';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    RAISE NOTICE 'All admin security checks passed. Test data rolled back.';
  END;
END
$$;
