-- Checks for cinemas, sessions and ticket types. Changes nothing: everything is rolled back.
-- Run after 20261123120000_cinema_sessions.sql. Every line of output should say "ok".
BEGIN;
DO $$
DECLARE
  v_secret text := (SELECT value FROM payment_settings WHERE key = 'backend_secret');
  v_event uuid;
  v_cinema uuid := '30000000-0000-4000-8000-000000000001';
  v_admin uuid := gen_random_uuid();
  v_far uuid; v_near uuid; v_gen uuid; v_past uuid;
  v_adult uuid; v_child uuid; v_student uuid; v_other uuid;
  v_seats uuid[];
  v_sold0 integer;
  b jsonb; p jsonb; r jsonb;
  v_err text;
BEGIN
  -- A movie and an admin to work with.
  INSERT INTO events (title, description, category, venue, city, starts_at)
  VALUES ('Check Movie', '', 'Cinema', 'Cinemas across Almaty', 'Almaty', now() - interval '30 days')
  RETURNING id INTO v_event;
  INSERT INTO auth.users (id) VALUES (v_admin);
  INSERT INTO admin_users (user_id) VALUES (v_admin);

  -- 1. only admins create sessions
  BEGIN
    PERFORM admin_create_session(v_event, v_cinema, now() + interval '5 days', 'Hall 1', 'IMAX', 'RU', 6, 10, NULL,
      '[{"name":"Adult","price_kzt":3000}]');
    RAISE EXCEPTION 'non-admin created a session';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_far := admin_create_session(v_event, v_cinema, now() + interval '5 days', 'Hall 1', 'IMAX', 'RU', 6, 10, NULL,
    '[{"name":"Adult","price_kzt":3000},{"name":"Student","price_kzt":2200,"note":"Student ID"},{"name":"Child","price_kzt":1800}]');
  v_near := admin_create_session(v_event, v_cinema, now() + interval '3 hours', 'Hall 2', '2D', 'KZ', 5, 8, NULL,
    '[{"name":"Adult","price_kzt":2500},{"name":"Child","price_kzt":1500}]');
  v_gen := admin_create_session(v_event, v_cinema, now() + interval '4 days', '', '', NULL, NULL, NULL, 40,
    '[{"name":"Adult","price_kzt":2000},{"name":"Child","price_kzt":1000}]');
  v_past := admin_create_session(v_event, v_cinema, now() - interval '1 hour', 'Hall 3', '2D', NULL, NULL, NULL, 20,
    '[{"name":"Adult","price_kzt":2000}]');
  BEGIN
    PERFORM admin_create_session(v_event, v_cinema, now() + interval '5 days', 'Hall 1', '2D', NULL, 2, 2, NULL, '[{"name":"Adult","price_kzt":1}]');
    RAISE EXCEPTION 'duplicate session was allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'This session already exists%', v_err;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT seating FROM ticket_tiers WHERE id = v_far) = 'reserved', 'seat map missing';
  ASSERT (SELECT count(*) FROM seats WHERE tier_id = v_far) = 60, 'wrong seat count';
  ASSERT (SELECT capacity FROM ticket_tiers WHERE id = v_gen) = 40 AND (SELECT seating FROM ticket_tiers WHERE id = v_gen) = 'general', 'general session wrong';
  ASSERT (SELECT name FROM ticket_tiers WHERE id = v_far) = 'Hall 1 · IMAX', 'session name wrong';
  RAISE NOTICE 'ok 1 admins create sessions with seat maps and ticket types';

  SELECT id INTO v_adult FROM tier_fares WHERE tier_id = v_far AND name = 'Adult';
  SELECT id INTO v_student FROM tier_fares WHERE tier_id = v_far AND name = 'Student';
  SELECT id INTO v_child FROM tier_fares WHERE tier_id = v_far AND name = 'Child';
  SELECT id INTO v_other FROM tier_fares WHERE tier_id = v_gen AND name = 'Adult';
  SELECT array_agg(id ORDER BY row_no, seat_no) INTO v_seats FROM (SELECT * FROM seats WHERE tier_id = v_far ORDER BY row_no, seat_no LIMIT 3) s;
  SELECT sold INTO v_sold0 FROM ticket_tiers WHERE id = v_far;

  -- 2. old paths refuse sessions with ticket types
  BEGIN
    PERFORM create_booking_with_seats(v_far, v_seats, 'Old Path', 'old@example.com');
    RAISE EXCEPTION 'old seat path allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Please choose ticket types%', v_err;
  END;
  BEGIN
    PERFORM create_booking(v_gen, 1, 'Old Path', 'old@example.com');
    RAISE EXCEPTION 'old quantity path allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Please choose ticket types%', v_err;
  END;
  RAISE NOTICE 'ok 2 old booking paths refuse sessions with ticket types';

  -- 3. bad input
  BEGIN
    PERFORM create_fare_booking(v_far, v_seats, jsonb_build_array(jsonb_build_object('fare_id', v_adult, 'quantity', 2)), 'A', 'a@example.com');
    RAISE EXCEPTION 'seat/ticket mismatch allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Choose one ticket type for every seat%', v_err;
  END;
  BEGIN
    PERFORM create_fare_booking(v_far, v_seats[1:1], jsonb_build_array(jsonb_build_object('fare_id', v_other, 'quantity', 1)), 'A', 'a@example.com');
    RAISE EXCEPTION 'foreign fare allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Those ticket types%', v_err;
  END;
  BEGIN
    PERFORM create_fare_booking(v_far, v_seats[1:2], jsonb_build_array(
      jsonb_build_object('fare_id', v_child, 'quantity', 1), jsonb_build_object('fare_id', v_child, 'quantity', 1)), 'A', 'a@example.com');
    RAISE EXCEPTION 'duplicate fare allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Those ticket types%', v_err;
  END;
  BEGIN
    PERFORM create_fare_booking(v_far, v_seats[1:1], jsonb_build_array(jsonb_build_object('fare_id', v_child, 'quantity', -1), jsonb_build_object('fare_id', v_adult, 'quantity', 2)), 'A', 'a@example.com');
    RAISE EXCEPTION 'negative quantity allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Those ticket types%', v_err;
  END;
  BEGIN
    PERFORM create_fare_booking(v_past, NULL, (SELECT jsonb_build_array(jsonb_build_object('fare_id', id, 'quantity', 1)) FROM tier_fares WHERE tier_id = v_past), 'A', 'a@example.com');
    RAISE EXCEPTION 'past session allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'This session has already started%', v_err;
  END;
  RAISE NOTICE 'ok 3 wrong counts, foreign or duplicate types and past sessions are refused';

  -- 4. mixed ticket types with seats: 2 adult + 1 child
  b := create_fare_booking(v_far, v_seats, jsonb_build_array(
    jsonb_build_object('fare_id', v_adult, 'quantity', 2), jsonb_build_object('fare_id', v_child, 'quantity', 1),
    jsonb_build_object('fare_id', v_student, 'quantity', 0)), 'Aigerim', 'Aigerim@Example.com');
  ASSERT b->>'status' = 'pending', 'not pending';
  ASSERT (b->>'total_kzt')::int = 2 * 3000 + 1800, 'wrong total ' || (b->>'total_kzt');
  ASSERT (b->>'quantity')::int = 3, 'wrong quantity';
  ASSERT jsonb_array_length(b->'fares') = 2, 'zero-quantity fare stored: ' || (b->'fares')::text;
  ASSERT b->>'event_venue' = 'Kinopark 11 IMAX Esentai' AND b->>'hall' = 'Hall 1' AND b->>'format' = 'IMAX', 'cinema info missing';
  ASSERT (b->>'event_starts_at')::timestamptz = (SELECT starts_at FROM ticket_tiers WHERE id = v_far), 'receipt shows movie date, not session time';
  ASSERT jsonb_array_length(b->'seat_labels') = 3, 'seats missing';
  ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_far) = v_sold0 + 3, 'sold not increased';
  RAISE NOTICE 'ok 4 mixed ticket types with seats: right total, session time and cinema';

  -- 5. pay, then cancel: refund follows the SESSION time (5 days away -> 100%)
  p := create_payment(b->>'booking_code', 'aigerim@example.com', 'kaspi_qr', v_secret);
  ASSERT (p->>'amount_kzt')::int = 7800, 'payment amount differs from the total';
  r := confirm_payment((p->>'id')::uuid, 'ref-s1', 7800, v_secret);
  ASSERT r->>'status' = 'confirmed', 'not confirmed';
  ASSERT (r->'refund_quote'->>'percent')::int = 100, 'refund should use session time';
  r := cancel_booking(b->>'booking_code', 'aigerim@example.com');
  ASSERT r->>'status' = 'cancelled' AND (r->'payment'->>'refund_kzt')::int = 7800, 'refund wrong';
  ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_far) = v_sold0, 'sold not restored';
  ASSERT NOT EXISTS (SELECT 1 FROM booking_seats WHERE seat_id = ANY (v_seats)), 'seats not freed';
  RAISE NOTICE 'ok 5 payment confirms, cancel refunds by session time and frees seats';

  -- 6. session in 3 hours -> 50% refund even though the movie "date" was a month ago
  SELECT array_agg(id) INTO v_seats FROM (SELECT id FROM seats WHERE tier_id = v_near LIMIT 1) s;
  b := create_fare_booking(v_near, v_seats, (SELECT jsonb_build_array(jsonb_build_object('fare_id', id, 'quantity', 1)) FROM tier_fares WHERE tier_id = v_near AND name = 'Adult'), 'Near', 'near@example.com');
  p := create_payment(b->>'booking_code', 'near@example.com', 'card', v_secret);
  PERFORM confirm_payment((p->>'id')::uuid, 'ref-s2', 2500, v_secret);
  r := cancel_booking(b->>'booking_code', 'near@example.com');
  ASSERT (r->'payment'->>'refund_kzt')::int = 1250, 'expected 50% refund, got ' || (r->'payment'->>'refund_kzt');
  RAISE NOTICE 'ok 6 refund percent uses the session time';

  -- 7. general session (no seat map) with ticket types
  b := create_fare_booking(v_gen, NULL, jsonb_build_array(jsonb_build_object('fare_id', v_other, 'quantity', 2)), 'Gen', 'gen@example.com');
  ASSERT (b->>'total_kzt')::int = 4000 AND b->>'status' = 'pending', 'general session booking wrong';
  BEGIN
    PERFORM create_fare_booking(v_gen, v_seats, jsonb_build_array(jsonb_build_object('fare_id', v_other, 'quantity', 1)), 'Gen', 'gen2@example.com');
    RAISE EXCEPTION 'seats on a general session allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'This session does not use seat selection%', v_err;
  END;
  RAISE NOTICE 'ok 7 sessions without a seat map work with ticket types';

  -- 8. delete: only sessions nobody booked
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  BEGIN
    PERFORM admin_delete_session(v_gen);
    RAISE EXCEPTION 'booked session deleted';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'People have already booked%', v_err;
  END;
  PERFORM admin_delete_session(v_past);
  ASSERT NOT EXISTS (SELECT 1 FROM ticket_tiers WHERE id = v_past), 'session not deleted';
  RAISE NOTICE 'ok 8 admins delete only unbooked sessions';

  -- 9. concert tiers still work the old way
  ASSERT (SELECT count(*) FROM ticket_tiers t WHERE t.starts_at IS NULL AND NOT EXISTS (SELECT 1 FROM tier_fares f WHERE f.tier_id = t.id)) > 0, 'no plain tiers left';
  RAISE NOTICE 'ok 9 plain ticket types (VIP, Standard...) untouched';
END
$$;
ROLLBACK;
