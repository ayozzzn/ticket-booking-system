-- Checks for seats + payments together. Changes nothing: everything is rolled back at the end.
-- Run after 20261116170000_seats_with_payments.sql. Every line of output should say "ok".
BEGIN;
DO $$
DECLARE
  v_secret text := (SELECT value FROM payment_settings WHERE key = 'backend_secret');
  v_tier uuid := (SELECT id FROM ticket_tiers t WHERE seating = 'reserved'
                  AND NOT EXISTS (SELECT 1 FROM tier_fares f WHERE f.tier_id = t.id)
                  AND (SELECT starts_at FROM events e WHERE e.id = t.event_id) > now() + interval '3 days'
                  AND capacity - sold >= 4 LIMIT 1);
  v_seats uuid[];
  v_sold0 integer;
  b jsonb; b2 jsonb; p jsonb; r jsonb;
  v_pay uuid;
  v_err text;
BEGIN
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No reserved tier with a future event to test with.'; END IF;
  SELECT sold INTO v_sold0 FROM ticket_tiers WHERE id = v_tier;
  SELECT array_agg(id) INTO v_seats FROM (
    SELECT s.id FROM seats s WHERE s.tier_id = v_tier AND NOT s.blocked
      AND NOT EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id)
    ORDER BY row_no, seat_no LIMIT 2) x;

  -- 1. seat booking is pending and holds the seats
  b := create_booking_with_seats(v_tier, v_seats, 'Seat Tester', 'seat.tester@example.com');
  ASSERT b->>'status' = 'pending', 'seat booking must be pending';
  ASSERT jsonb_array_length(b->'seat_labels') = 2, 'seat labels missing';
  ASSERT (b->>'total_kzt')::int > 0 AND b->>'hold_expires_at' IS NOT NULL, 'kzt total / hold missing';
  ASSERT (SELECT count(*) FROM booking_seats WHERE seat_id = ANY (v_seats)) = 2, 'seats not held';
  ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = v_sold0 + 2, 'sold not increased';
  RAISE NOTICE 'ok 1 seat booking is pending and holds seats';

  -- 2. the same seats cannot be taken twice; plain create_booking is refused
  BEGIN
    PERFORM create_booking_with_seats(v_tier, v_seats, 'Other', 'other@example.com');
    RAISE EXCEPTION 'double booking was allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Some of these seats%', v_err;
  END;
  BEGIN
    PERFORM create_booking(v_tier, 1, 'Other', 'other@example.com');
    RAISE EXCEPTION 'quantity booking on a seat tier was allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE 'Please choose your seats%', v_err;
  END;
  RAISE NOTICE 'ok 2 no double booking, no quantity booking on seat tiers';

  -- 3. pay -> confirmed, seats stay
  p := create_payment(b->>'booking_code', 'seat.tester@example.com', 'card', v_secret);
  v_pay := (p->>'id')::uuid;
  r := confirm_payment(v_pay, 'test-ref-1', (p->>'amount_kzt')::int, v_secret);
  ASSERT r->>'status' = 'confirmed', 'not confirmed after payment';
  ASSERT (SELECT count(*) FROM booking_seats WHERE seat_id = ANY (v_seats)) = 2, 'seats lost after payment';
  RAISE NOTICE 'ok 3 payment confirms the seat booking';

  -- 4. cancel -> seats free again, refund recorded
  r := cancel_booking(b->>'booking_code', 'seat.tester@example.com');
  ASSERT r->>'status' = 'cancelled', 'not cancelled';
  ASSERT (SELECT count(*) FROM booking_seats WHERE seat_id = ANY (v_seats)) = 0, 'seats not released on cancel';
  ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = v_sold0, 'sold not restored on cancel';
  ASSERT (r->'payment'->>'refund_kzt')::int > 0, 'refund missing';
  RAISE NOTICE 'ok 4 cancel frees seats and records a refund';

  -- 5. unpaid hold expires -> seats free
  b := create_booking_with_seats(v_tier, v_seats, 'Seat Tester', 'seat.tester@example.com');
  p := create_payment(b->>'booking_code', 'seat.tester@example.com', 'kaspi_qr', v_secret);
  UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE booking_code = b->>'booking_code';
  PERFORM release_expired_holds();
  ASSERT (SELECT status FROM bookings WHERE booking_code = b->>'booking_code') = 'expired', 'not expired';
  ASSERT (SELECT count(*) FROM booking_seats WHERE seat_id = ANY (v_seats)) = 0, 'seats not released on expiry';
  ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = v_sold0, 'sold not restored on expiry';
  RAISE NOTICE 'ok 5 expired hold frees seats';

  -- 6. late payment, seats still free -> same seats back
  r := confirm_payment((p->>'id')::uuid, 'test-ref-2', (p->>'amount_kzt')::int, v_secret);
  ASSERT r->>'status' = 'confirmed', 'late payment should confirm when seats are free';
  ASSERT (SELECT count(*) FROM booking_seats bs JOIN bookings k ON k.id = bs.booking_id
          WHERE bs.seat_id = ANY (v_seats) AND k.booking_code = b->>'booking_code') = 2, 'seats not re-taken';
  PERFORM cancel_booking(b->>'booking_code', 'seat.tester@example.com');
  RAISE NOTICE 'ok 6 late payment gets the same seats back';

  -- 7. late payment, seats taken by someone else -> full refund, booking stays expired
  b := create_booking_with_seats(v_tier, v_seats, 'Seat Tester', 'seat.tester@example.com');
  p := create_payment(b->>'booking_code', 'seat.tester@example.com', 'halyk_qr', v_secret);
  UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE booking_code = b->>'booking_code';
  b2 := create_booking_with_seats(v_tier, v_seats[1:1], 'Fast Buyer', 'fast@example.com');
  r := confirm_payment((p->>'id')::uuid, 'test-ref-3', (p->>'amount_kzt')::int, v_secret);
  ASSERT r->>'status' = 'expired', 'late payment must not confirm when a seat is gone';
  ASSERT r->'payment'->>'refund_status' = 'pending' AND (r->'payment'->>'refund_kzt')::int = (p->>'amount_kzt')::int, 'full refund missing';
  ASSERT (SELECT count(*) FROM booking_seats WHERE seat_id = ANY (v_seats)) = 1, 'wrong seats held';
  RAISE NOTICE 'ok 7 late payment with a lost seat is refunded in full';

  ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier)
       = (SELECT count(*) FROM seats s WHERE s.tier_id = v_tier
          AND (s.blocked OR EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id))), 'sold counter drifted';
  RAISE NOTICE 'ok 8 sold counter = blocked + held seats';
END
$$;
ROLLBACK;
