/*
  Database self-test. Paste into the Supabase SQL editor and run.
  - Everything runs inside a sub-transaction that is rolled back at the end,
    so your real data is not changed.
  - "Success" = all checks passed. A failure shows the name of the failed check.
  - Assumes the seed data from the original migration is present.
*/
DO $$
DECLARE
  t_big   uuid := '10000000-0000-4000-8000-000000000101';  -- Midnight Jazz / General Admission
  t_small uuid := '10000000-0000-4000-8000-000000000402';  -- Glass Menagerie / Premium (few seats left)
  r jsonb;
  code text;
  v_before int;
  v_after int;
  v_left int;
  failed boolean;
  v_event uuid;
  v_tier uuid;
BEGIN
  BEGIN  -- sub-transaction: rolled back by the sentinel at the end

    -- T1: booking succeeds, counter grows, status is confirmed
    SELECT sold INTO v_before FROM ticket_tiers WHERE id = t_big;
    r := create_booking(t_big, 2, 'Test User', 'Test@Example.com');
    code := r->>'booking_code';
    SELECT sold INTO v_after FROM ticket_tiers WHERE id = t_big;
    ASSERT v_after = v_before + 2, 'T1: sold must grow by the booked quantity';
    ASSERT r->>'status' = 'confirmed', 'T1: new booking must be confirmed';
    ASSERT r->>'customer_email' = 'test@example.com', 'T1: email must be stored lowercase';
    ASSERT (r->>'total_cents')::int = 2 * 4500, 'T1: total must equal unit price x quantity';

    -- T2: quantity 0 is rejected
    failed := false;
    BEGIN PERFORM create_booking(t_big, 0, 'X', 'x@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T2: quantity 0 must be rejected';

    -- T3: quantity 11 is rejected
    failed := false;
    BEGIN PERFORM create_booking(t_big, 11, 'X', 'x@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T3: quantity 11 must be rejected';

    -- T4: invalid email is rejected
    failed := false;
    BEGIN PERFORM create_booking(t_big, 1, 'X', 'not-an-email'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T4: invalid email must be rejected';

    -- T5: overselling is rejected
    SELECT capacity - sold INTO v_left FROM ticket_tiers WHERE id = t_small;
    ASSERT v_left < 10, 'T5: test setup expects fewer than 10 seats left on the small tier';
    failed := false;
    BEGIN PERFORM create_booking(t_small, v_left + 1, 'X', 'oversell@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T5: booking more than remaining must be rejected';

    -- T6: per-email limit of 10 tickets per event
    PERFORM create_booking(t_big, 10, 'Limit User', 'limit@example.com');
    failed := false;
    BEGIN PERFORM create_booking(t_big, 1, 'Limit User', 'limit@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T6: 11th ticket for the same email and event must be rejected';

    -- T7: lookup with a wrong email returns nothing
    ASSERT get_booking(code, 'hacker@example.com') IS NULL, 'T7: wrong email must not reveal a booking';

    -- T8: cancelling with a wrong email fails
    failed := false;
    BEGIN PERFORM cancel_booking(code, 'hacker@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T8: cancel with wrong email must fail';

    -- T9: cancelling restores the counter and sets status; second cancel fails
    SELECT sold INTO v_before FROM ticket_tiers WHERE id = t_big;
    r := cancel_booking(code, 'test@example.com');
    SELECT sold INTO v_after FROM ticket_tiers WHERE id = t_big;
    ASSERT v_after = v_before - 2, 'T9: cancel must return tickets to the tier';
    ASSERT r->>'status' = 'cancelled', 'T9: status must be cancelled';
    failed := false;
    BEGIN PERFORM cancel_booking(code, 'test@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T9: cancelling twice must fail';

    -- T10: events in the past cannot be booked
    INSERT INTO events (title, venue, city, starts_at) VALUES ('Past test', 'Hall', 'Town', now() - interval '1 day')
      RETURNING id INTO v_event;
    INSERT INTO ticket_tiers (event_id, name, price_cents, capacity) VALUES (v_event, 'Std', 1000, 10)
      RETURNING id INTO v_tier;
    failed := false;
    BEGIN PERFORM create_booking(v_tier, 1, 'X', 'past@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'T10: booking a past event must be rejected';

    -- T11: constraint — total must match unit price x quantity
    failed := false;
    BEGIN
      INSERT INTO bookings (booking_code, event_id, tier_id, quantity, unit_price_cents, total_cents, customer_name, customer_email)
      VALUES ('BADTOTAL01', v_event, v_tier, 2, 1000, 5, 'X', 'x@example.com');
    EXCEPTION WHEN check_violation THEN failed := true; END;
    ASSERT failed, 'T11: wrong total must violate bookings_total_matches';

    -- T12: constraint — booking event must match its tier's event
    failed := false;
    BEGIN
      INSERT INTO bookings (booking_code, event_id, tier_id, quantity, unit_price_cents, total_cents, customer_name, customer_email)
      VALUES ('BADEVENT01', '20000000-0000-4000-8000-000000000001', v_tier, 1, 1000, 1000, 'X', 'x@example.com');
    EXCEPTION WHEN foreign_key_violation THEN failed := true; END;
    ASSERT failed, 'T12: mismatching event/tier must violate bookings_tier_event_fk';

    -- T13: sold counters are consistent with confirmed bookings
    ASSERT NOT EXISTS (SELECT 1 FROM v_sold_integrity WHERE NOT is_consistent),
      'T13: some ticket_tiers.sold values do not match confirmed bookings (see v_sold_integrity)';

    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'rollback test data';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    RAISE NOTICE 'All 13 database checks passed. Test data rolled back.';
  END;
END
$$;
