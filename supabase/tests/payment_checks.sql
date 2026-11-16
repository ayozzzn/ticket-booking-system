/*
  Payment self-test (run AFTER 20261116120000_kz_payments.sql).
  Paste into the Supabase SQL editor and run.
  - Everything runs in a sub-transaction that is rolled back at the end, so real data is not changed.
  - "Success" = all checks passed. A failure shows the name of the failed check.
  - Uses its own future event, so it does not depend on the seed dates.
*/
DO $$
DECLARE
  v_secret text;
  v_event uuid;
  v_tier uuid;
  v_free_tier uuid;
  v_small_tier uuid;
  r jsonb;
  r2 jsonb;
  code text;
  pay jsonb;
  pay_id uuid;
  v_sold_before int;
  v_sold int;
  failed boolean;
  v_rate numeric;
BEGIN
  BEGIN  -- sub-transaction, rolled back by the sentinel at the end
    SELECT value INTO v_secret FROM payment_settings WHERE key = 'backend_secret';
    SELECT value::numeric INTO v_rate FROM payment_settings WHERE key = 'kzt_per_usd';

    INSERT INTO events (title, venue, city, starts_at)
      VALUES ('Payment test event', 'Hall', 'Almaty', now() + interval '10 days') RETURNING id INTO v_event;
    INSERT INTO ticket_tiers (event_id, name, price_cents, capacity) VALUES (v_event, 'Std', 4000, 20) RETURNING id INTO v_tier;
    INSERT INTO ticket_tiers (event_id, name, price_cents, capacity) VALUES (v_event, 'Free', 0, 20) RETURNING id INTO v_free_tier;
    INSERT INTO ticket_tiers (event_id, name, price_cents, capacity) VALUES (v_event, 'Tiny', 1000, 2) RETURNING id INTO v_small_tier;

    -- P1: a new booking is pending, holds the tickets and has a tenge total
    r := create_booking(v_tier, 2, 'Aigerim S', 'Aigerim@Example.com');
    code := r->>'booking_code';
    ASSERT r->>'status' = 'pending', 'P1: new paid booking must be pending';
    ASSERT r->>'hold_expires_at' IS NOT NULL, 'P1: pending booking needs hold_expires_at';
    ASSERT (r->>'total_kzt')::int = round(8000 * v_rate / 100.0), 'P1: total_kzt must follow the exchange rate';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = 2, 'P1: pending booking must hold the tickets';
    ASSERT r->'payment' = 'null'::jsonb, 'P1: no payment yet';

    -- P2: payment functions need the backend secret
    failed := false;
    BEGIN PERFORM create_payment(code, 'aigerim@example.com', 'card', 'wrong-secret'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P2: create_payment with a wrong secret must fail';
    failed := false;
    BEGIN PERFORM confirm_payment(gen_random_uuid(), 'x', 1, 'wrong-secret'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P2: confirm_payment with a wrong secret must fail';
    failed := false;
    BEGIN PERFORM create_payment(code, 'someone-else@example.com', 'card', v_secret); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P2: create_payment with a wrong email must fail';
    failed := false;
    BEGIN PERFORM create_payment(code, 'aigerim@example.com', 'bitcoin', v_secret); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P2: unknown payment method must fail';

    -- P3: switching method replaces the payment in progress
    pay := create_payment(code, 'aigerim@example.com', 'card', v_secret);
    ASSERT pay->>'status' = 'awaiting' AND pay->>'method' = 'card', 'P3: first payment is awaiting';
    pay_id := (pay->>'id')::uuid;
    pay := create_payment(code, 'aigerim@example.com', 'kaspi_qr', v_secret);
    ASSERT (SELECT status FROM payments WHERE id = pay_id) = 'cancelled', 'P3: old attempt must be cancelled';
    ASSERT (SELECT count(*) FROM payments p JOIN bookings b ON b.id = p.booking_id
            WHERE b.booking_code = code AND p.status IN ('awaiting', 'requires_action')) = 1, 'P3: only one active payment';
    pay_id := (pay->>'id')::uuid;

    -- P4: card flow -> requires_action -> failed attempt -> new attempt
    pay := update_payment(pay_id, 'requires_action', 'visa', '4242', NULL, 'ref-1', v_secret);
    ASSERT pay->>'status' = 'requires_action' AND pay->>'card_last4' = '4242', 'P4: requires_action keeps brand and last 4';
    pay := update_payment(pay_id, 'failed', NULL, NULL, 'Card declined', NULL, v_secret);
    ASSERT pay->>'status' = 'failed', 'P4: payment can fail';
    failed := false;
    BEGIN PERFORM update_payment(pay_id, 'requires_action', NULL, NULL, NULL, NULL, v_secret); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P4: a failed payment cannot be revived';
    ASSERT (SELECT status FROM bookings WHERE booking_code = code) = 'pending', 'P4: booking stays pending after a failed payment';
    pay := create_payment(code, 'aigerim@example.com', 'card', v_secret);
    pay_id := (pay->>'id')::uuid;

    -- P5: confirm checks the amount, confirms the booking, and is idempotent
    failed := false;
    BEGIN PERFORM confirm_payment(pay_id, 'ref-2', 1, v_secret); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P5: wrong amount must be rejected';
    ASSERT (SELECT status FROM bookings WHERE booking_code = code) = 'pending', 'P5: booking still pending after wrong amount';
    r := confirm_payment(pay_id, 'ref-2', (pay->>'amount_kzt')::int, v_secret);
    ASSERT r->>'status' = 'confirmed' AND r->>'hold_expires_at' IS NULL, 'P5: booking must be confirmed';
    ASSERT r->'payment'->>'status' = 'paid', 'P5: payment must be paid';
    ASSERT r->'refund_quote'->>'percent' = '100', 'P5: refund quote is 100% far from the event';
    r2 := confirm_payment(pay_id, 'ref-2', (pay->>'amount_kzt')::int, v_secret);
    ASSERT r2->>'status' = 'confirmed', 'P5: confirming twice is harmless';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = 2, 'P5: confirming must not change the sold counter';
    failed := false;
    BEGIN PERFORM create_payment(code, 'aigerim@example.com', 'card', v_secret); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P5: a paid booking cannot be paid again';

    -- P6: payment status is private to the owner
    ASSERT get_payment_status(pay_id, code, 'hacker@example.com') IS NULL, 'P6: wrong email must not see the payment';
    ASSERT get_payment_status(pay_id, code, 'aigerim@example.com')->'payment'->>'status' = 'paid', 'P6: owner sees the payment';

    -- P7: cancelling a paid booking: 100% refund, ticket released, refund completed by the backend
    r := cancel_booking(code, 'aigerim@example.com');
    ASSERT r->>'status' = 'cancelled', 'P7: booking cancelled';
    ASSERT r->'payment'->>'refund_status' = 'pending' AND (r->'payment'->>'refund_percent')::int = 100, 'P7: 100% refund pending';
    ASSERT (r->'payment'->>'refund_kzt')::int = (pay->>'amount_kzt')::int, 'P7: refund equals amount paid';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = 0, 'P7: tickets released';
    ASSERT jsonb_array_length(list_pending_refunds(v_secret)) >= 1, 'P7: refund appears in the pending list';
    r := complete_refund(pay_id, 'refund-1', v_secret);
    ASSERT r->'payment'->>'refund_status' = 'refunded', 'P7: refund completed';
    r := complete_refund(pay_id, 'refund-1', v_secret);
    ASSERT r->'payment'->>'refund_status' = 'refunded', 'P7: completing a refund twice is harmless';
    failed := false;
    BEGIN PERFORM cancel_booking(code, 'aigerim@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P7: cannot cancel twice';

    -- P8: refund steps depend on how close the event is
    ASSERT refund_percent_for(now() + interval '49 hours') = 100, 'P8: 49 h -> 100';
    ASSERT refund_percent_for(now() + interval '30 hours') = 75, 'P8: 30 h -> 75';
    ASSERT refund_percent_for(now() + interval '2 hours') = 50, 'P8: 2 h -> 50';

    r := create_booking(v_tier, 1, 'Dana K', 'dana@example.com');
    code := r->>'booking_code';
    pay := create_payment(code, 'dana@example.com', 'halyk_qr', v_secret);
    pay_id := (pay->>'id')::uuid;
    PERFORM confirm_payment(pay_id, 'ref-3', (pay->>'amount_kzt')::int, v_secret);
    UPDATE events SET starts_at = now() + interval '30 hours' WHERE id = v_event;
    r := cancel_booking(code, 'dana@example.com');
    ASSERT (r->'payment'->>'refund_percent')::int = 75, 'P8: 30 h before -> 75% refund';
    ASSERT (r->'payment'->>'refund_kzt')::int = floor((pay->>'amount_kzt')::int * 0.75), 'P8: refund amount is 75%';
    UPDATE events SET starts_at = now() + interval '10 days' WHERE id = v_event;

    -- P9: unpaid booking: cancelling just releases the hold, no refund
    SELECT sold INTO v_sold_before FROM ticket_tiers WHERE id = v_tier;
    r := create_booking(v_tier, 3, 'Timur', 'timur@example.com');
    code := r->>'booking_code';
    pay := create_payment(code, 'timur@example.com', 'card', v_secret);
    pay_id := (pay->>'id')::uuid;
    r := cancel_booking(code, 'timur@example.com');
    ASSERT r->>'status' = 'expired', 'P9: abandoned booking becomes expired';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = v_sold_before, 'P9: abandoned tickets released';
    ASSERT (SELECT status FROM payments WHERE id = pay_id) = 'cancelled', 'P9: open payment cancelled';

    -- P10: holds expire, tickets come back
    r := create_booking(v_tier, 4, 'Nurlan', 'nurlan@example.com');
    code := r->>'booking_code';
    pay := create_payment(code, 'nurlan@example.com', 'kaspi_qr', v_secret);
    pay_id := (pay->>'id')::uuid;
    UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE booking_code = code;
    ASSERT release_expired_holds() >= 1, 'P10: sweeper must release the expired hold';
    ASSERT (SELECT status FROM bookings WHERE booking_code = code) = 'expired', 'P10: booking expired';
    ASSERT (SELECT status FROM payments WHERE id = pay_id) = 'expired', 'P10: payment expired';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = v_sold_before, 'P10: tickets released';
    failed := false;
    BEGIN PERFORM create_payment(code, 'nurlan@example.com', 'card', v_secret); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P10: cannot pay an expired booking';

    -- P11: money arrives after expiry -> tickets are taken back when still free
    r := confirm_payment(pay_id, 'late-1', (pay->>'amount_kzt')::int, v_secret);
    ASSERT r->>'status' = 'confirmed', 'P11: late payment re-confirms the booking when tickets are free';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_tier) = v_sold_before + 4, 'P11: tickets taken again';

    -- P12: ... and refunded in full when the tickets are gone
    r := create_booking(v_small_tier, 2, 'Late Payer', 'late@example.com');
    code := r->>'booking_code';
    pay := create_payment(code, 'late@example.com', 'card', v_secret);
    pay_id := (pay->>'id')::uuid;
    UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE booking_code = code;
    PERFORM release_expired_holds();
    PERFORM create_booking(v_small_tier, 2, 'Fast Buyer', 'fast@example.com');  -- takes the freed tickets
    r := confirm_payment(pay_id, 'late-2', (pay->>'amount_kzt')::int, v_secret);
    ASSERT r->>'status' = 'expired', 'P12: booking stays expired when tickets are gone';
    ASSERT r->'payment'->>'status' = 'paid' AND r->'payment'->>'refund_status' = 'pending'
       AND (r->'payment'->>'refund_percent')::int = 100, 'P12: late payment is refunded in full';
    ASSERT (SELECT sold FROM ticket_tiers WHERE id = v_small_tier) = 2, 'P12: no overselling';

    -- P13: free tickets are confirmed immediately, no payment needed
    r := create_booking(v_free_tier, 1, 'Free Guest', 'free@example.com');
    ASSERT r->>'status' = 'confirmed' AND (r->>'total_kzt')::int = 0, 'P13: free booking confirmed at once';

    -- P14: pending bookings count towards the 10-ticket limit
    PERFORM create_booking(v_tier, 8, 'Limit', 'limit2@example.com');
    failed := false;
    BEGIN PERFORM create_booking(v_tier, 3, 'Limit', 'limit2@example.com'); EXCEPTION WHEN OTHERS THEN failed := true; END;
    ASSERT failed, 'P14: held tickets count towards the per-email limit';

    -- P15: roles. Visitors cannot read payments or confirm without the secret.
    SET LOCAL ROLE anon;
    failed := false;
    BEGIN PERFORM 1 FROM payments LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    ASSERT failed, 'P15: anon must not read the payments table';
    failed := false;
    BEGIN PERFORM 1 FROM payment_settings LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    ASSERT failed, 'P15: anon must not read payment_settings';
    failed := false;
    BEGIN PERFORM confirm_payment(pay_id, 'hack', 1, 'guess'); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    ASSERT failed, 'P15: anon cannot confirm a payment without the secret';
    failed := false;
    BEGIN PERFORM _booking_json(NULL::bookings); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    ASSERT failed, 'P15: internal helpers are not callable by anon';
    RESET ROLE;

    -- P16: counters still match pending + confirmed bookings
    ASSERT NOT EXISTS (SELECT 1 FROM v_sold_integrity WHERE NOT is_consistent),
      'P16: ticket_tiers.sold does not match held + confirmed bookings (see v_sold_integrity)';

    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'rollback test data';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    RAISE NOTICE 'All 16 payment check groups passed. Test data rolled back.';
  END;
END
$$;
