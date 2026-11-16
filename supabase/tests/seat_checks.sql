/*
  Seat selection self-test. Run in the Supabase SQL editor AFTER 20261116120000_seat_selection.sql.
  - Creates its own future event, so it does not depend on the seed dates.
  - Everything is rolled back at the end.
  "Success" = all checks passed. A failure names the broken rule.
*/
DO $$
DECLARE
  v_event uuid;
  v_tier uuid;
  v_other_tier uuid;
  v_seats uuid[];
  v_other_seat uuid;
  r jsonb;
  code text;
  v_sold_before int;
  v_sold_after int;
  failed boolean;
  v_taken int;
BEGIN
  BEGIN  -- rolled back by the sentinel at the end

    INSERT INTO events (title, venue, city, starts_at)
    VALUES ('Seat test', 'Hall', 'Almaty', now() + interval '10 days') RETURNING id INTO v_event;

    INSERT INTO ticket_tiers (event_id, name, price_cents, capacity)
    VALUES (v_event, 'Stalls', 2000, 20) RETURNING id INTO v_tier;
    INSERT INTO ticket_tiers (event_id, name, price_cents, capacity)
    VALUES (v_event, 'Circle', 1000, 10) RETURNING id INTO v_other_tier;

    -- S1: seat map has one seat per capacity unit and the tier becomes reserved
    PERFORM public.generate_tier_seats(v_tier, 10);
    PERFORM public.generate_tier_seats(v_other_tier, 5);
    ASSERT (SELECT count(*) FROM seats WHERE tier_id = v_tier) = 20, 'S1: 20 seats expected';
    ASSERT (SELECT seating FROM ticket_tiers WHERE id = v_tier) = 'reserved', 'S1: tier must be reserved';
    ASSERT (SELECT row_label FROM seats WHERE tier_id = v_tier AND row_no = 2 AND seat_no = 1) = 'B', 'S1: row 2 must be B';
    ASSERT public.seat_row_label(27) = 'AA', 'S1: row 27 must be AA';

    -- S2: generating twice is rejected
    failed := false;
    BEGIN PERFORM public.generate_tier_seats(v_tier, 10); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'S2: a second seat map for the same tier must be rejected';

    -- S3: the public seat map shows every seat as free
    r := public.get_tier_seats(v_tier);
    ASSERT jsonb_array_length(r) = 20, 'S3: seat map must contain 20 seats';
    SELECT count(*) INTO v_taken FROM jsonb_array_elements(r) e WHERE (e->>'taken')::boolean;
    ASSERT v_taken = 0, 'S3: no seat may be taken yet';

    -- S4: the old quantity-based function refuses a reserved tier
    failed := false;
    BEGIN PERFORM create_booking(v_tier, 1, 'X', 'x@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'S4: create_booking must refuse a reserved tier';

    -- S5: booking two seats works, labels and counters are right
    SELECT array_agg(id ORDER BY row_no, seat_no) INTO v_seats
    FROM (SELECT id, row_no, seat_no FROM seats WHERE tier_id = v_tier ORDER BY row_no, seat_no LIMIT 2) q;
    SELECT sold INTO v_sold_before FROM ticket_tiers WHERE id = v_tier;
    r := create_booking_with_seats(v_tier, v_seats, 'Seat User', 'Seat@Example.com');
    code := r->>'booking_code';
    SELECT sold INTO v_sold_after FROM ticket_tiers WHERE id = v_tier;
    ASSERT v_sold_after = v_sold_before + 2, 'S5: sold must grow by the number of seats';
    ASSERT (r->>'quantity')::int = 2, 'S5: quantity must equal the number of seats';
    ASSERT (r->>'total_cents')::int = 4000, 'S5: total must be 2 x unit price';
    ASSERT r->'seat_labels' = '["A1","A2"]'::jsonb, 'S5: seat labels must be A1 and A2';

    -- S6: those seats now show as taken
    SELECT count(*) INTO v_taken FROM jsonb_array_elements(public.get_tier_seats(v_tier)) e WHERE (e->>'taken')::boolean;
    ASSERT v_taken = 2, 'S6: exactly 2 seats must be taken';

    -- S7: the same seat cannot be booked twice
    failed := false;
    BEGIN PERFORM create_booking_with_seats(v_tier, ARRAY[v_seats[1]], 'Other', 'other@example.com');
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'S7: an already booked seat must be rejected';

    -- S8: a seat of another tier is rejected
    SELECT id INTO v_other_seat FROM seats WHERE tier_id = v_other_tier LIMIT 1;
    failed := false;
    BEGIN PERFORM create_booking_with_seats(v_tier, ARRAY[v_other_seat], 'Other', 'other@example.com');
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'S8: a seat from another ticket type must be rejected';

    -- S9: the same seat twice in one request is rejected
    failed := false;
    BEGIN
      PERFORM create_booking_with_seats(
        v_tier,
        ARRAY[(SELECT id FROM seats WHERE tier_id = v_tier AND row_no = 2 AND seat_no = 1),
              (SELECT id FROM seats WHERE tier_id = v_tier AND row_no = 2 AND seat_no = 1)],
        'Other', 'other@example.com');
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'S9: duplicate seats in one request must be rejected';

    -- S10: empty seat list is rejected
    failed := false;
    BEGIN PERFORM create_booking_with_seats(v_tier, ARRAY[]::uuid[], 'Other', 'other@example.com');
    EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'S10: no seats must be rejected';

    -- S11: cancelling frees the seats and restores the counter
    r := cancel_booking(code, 'seat@example.com');
    ASSERT r->>'status' = 'cancelled', 'S11: booking must be cancelled';
    SELECT count(*) INTO v_taken FROM jsonb_array_elements(public.get_tier_seats(v_tier)) e WHERE (e->>'taken')::boolean;
    ASSERT v_taken = 0, 'S11: seats must be free again after cancellation';
    SELECT sold INTO v_sold_after FROM ticket_tiers WHERE id = v_tier;
    ASSERT v_sold_after = v_sold_before, 'S11: sold must go back to its old value';
    ASSERT r->'seat_labels' = '["A1","A2"]'::jsonb, 'S11: cancelled booking keeps its seat labels for history';

    -- S12: the freed seats can be booked again
    r := create_booking_with_seats(v_tier, v_seats, 'Second User', 'second@example.com');
    ASSERT r->>'status' = 'confirmed', 'S12: freed seats must be bookable again';

    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'rollback test data';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    RAISE NOTICE 'All 12 seat checks passed. Test data rolled back.';
  END;
END
$$;
