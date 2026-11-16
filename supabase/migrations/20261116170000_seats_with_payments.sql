/*
# Seat selection + payments, working together

Run AFTER both 20261116120000_seat_selection.sql and 20261116120000_kz_payments.sql
(in any order between those two). Safe to run more than once.

Why this file exists: both migrations replace create_booking, get_booking and get_my_bookings,
so whichever ran last removed the other one's behaviour. This file sets the final versions.

1. Seat bookings are now "pending" like every other booking: the seats are held for the
   payment time (payment_settings.hold_minutes) and become "confirmed" only after payment.
   Before this, create_booking_with_seats gave a confirmed ticket without any payment.
2. Seats are released when a booking is cancelled OR when its hold expires.
3. A payment that arrives after the hold expired gets the same seats back only if they are
   still free. If not, the money is refunded in full.
4. Booking receipts include seat_labels (for example C7, C8).
*/

-- 1. Receipt JSON with seats ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._booking_json(b public.bookings)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'booking_code', b.booking_code,
    'status', b.status,
    'cancelled_at', b.cancelled_at,
    'customer_name', b.customer_name,
    'customer_email', b.customer_email,
    'quantity', b.quantity,
    'total_cents', b.total_cents,
    'unit_price_cents', b.unit_price_cents,
    'total_kzt', b.total_kzt,
    'hold_expires_at', b.hold_expires_at,
    'created_at', b.created_at,
    'event_title', e.title,
    'event_venue', e.venue,
    'event_city', e.city,
    'event_starts_at', e.starts_at,
    'tier_name', t.name,
    'seating', t.seating,
    'seat_labels', to_jsonb(b.seat_labels),
    'payment', (
      SELECT public._payment_json(p)
      FROM public.payments p
      WHERE p.booking_id = b.id
      ORDER BY (p.status = 'paid') DESC, p.created_at DESC
      LIMIT 1
    ),
    'refund_quote', CASE
      WHEN b.status = 'confirmed' AND pp.id IS NOT NULL THEN jsonb_build_object(
        'percent', public.refund_percent_for(e.starts_at),
        'kzt', floor(pp.amount_kzt * public.refund_percent_for(e.starts_at) / 100.0)::int)
      ELSE NULL END
  )
  FROM public.events e
  JOIN public.ticket_tiers t ON t.id = b.tier_id
  LEFT JOIN public.payments pp ON pp.booking_id = b.id AND pp.status = 'paid'
  WHERE e.id = b.event_id;
$$;

CREATE OR REPLACE FUNCTION public.get_booking(p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.release_expired_holds();
  SELECT * INTO b FROM public.bookings
  WHERE booking_code = upper(trim(p_code))
    AND lower(customer_email) = lower(trim(p_email));
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public._booking_json(b);
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_bookings();
CREATE OR REPLACE FUNCTION public.get_my_bookings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM public.release_expired_holds();
  SELECT COALESCE(jsonb_agg(public._booking_json(b) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.bookings b
  WHERE b.user_id = auth.uid()
     OR (b.user_id IS NULL AND b.customer_email = lower(coalesce(auth.jwt() ->> 'email', '')));
  RETURN v_result;
END;
$$;

-- 2. General admission booking (payments version, refuses seat-map ticket types) -----------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_tier_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier public.ticket_tiers%ROWTYPE;
  v_starts timestamptz;
  v_already integer;
  v_code text;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_rate numeric;
  v_hold integer;
  v_free boolean;
  v_booking public.bookings;
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

  PERFORM public.release_expired_holds();

  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type no longer exists.';
  END IF;

  IF v_tier.seating = 'reserved' THEN
    RAISE EXCEPTION 'Please choose your seats for this ticket type.';
  END IF;

  SELECT starts_at INTO v_starts FROM public.events WHERE id = v_tier.event_id;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This event has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM public.bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status IN ('confirmed', 'pending');
  IF v_already + p_quantity > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  IF v_tier.capacity - v_tier.sold < p_quantity THEN
    RAISE EXCEPTION 'Only % ticket(s) left for this option.', v_tier.capacity - v_tier.sold;
  END IF;

  SELECT value::numeric INTO v_rate FROM public.payment_settings WHERE key = 'kzt_per_usd';
  SELECT value::integer INTO v_hold FROM public.payment_settings WHERE key = 'hold_minutes';
  v_free := v_tier.price_cents = 0;

  UPDATE public.ticket_tiers SET sold = sold + p_quantity WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, total_kzt,
    customer_name, customer_email, user_id,
    status, hold_expires_at
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, p_quantity,
    v_tier.price_cents, v_tier.price_cents * p_quantity,
    round(v_tier.price_cents * p_quantity * v_rate / 100.0)::integer,
    v_name, v_email, auth.uid(),
    CASE WHEN v_free THEN 'confirmed' ELSE 'pending' END,
    CASE WHEN v_free THEN NULL ELSE now() + make_interval(mins => coalesce(v_hold, 10)) END
  ) RETURNING * INTO v_booking;

  RETURN public._booking_json(v_booking);
END;
$$;

-- 3. Seat booking: held while the customer pays --------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_with_seats(
  p_tier_id uuid,
  p_seat_ids uuid[],
  p_customer_name text,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier public.ticket_tiers%ROWTYPE;
  v_starts timestamptz;
  v_already integer;
  v_code text;
  v_qty integer := coalesce(cardinality(p_seat_ids), 0);
  v_found integer;
  v_labels text[];
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_rate numeric;
  v_hold integer;
  v_free boolean;
  v_booking public.bookings;
BEGIN
  IF v_qty < 1 OR v_qty > 10 THEN
    RAISE EXCEPTION 'Please choose between 1 and 10 seats.';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_seat_ids) AS x) <> v_qty THEN
    RAISE EXCEPTION 'Each seat can only be selected once.';
  END IF;
  IF length(v_name) = 0 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;

  -- Free the seats of unpaid bookings whose time is over, before checking what is taken.
  PERFORM public.release_expired_holds();

  -- Same lock order as create_booking: tier row first.
  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type no longer exists.';
  END IF;
  IF v_tier.seating <> 'reserved' THEN
    RAISE EXCEPTION 'This ticket type does not use seat selection.';
  END IF;

  SELECT starts_at INTO v_starts FROM public.events WHERE id = v_tier.event_id;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'This event has already started.';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM public.bookings
  WHERE event_id = v_tier.event_id AND customer_email = v_email AND status IN ('confirmed', 'pending');
  IF v_already + v_qty > 10 THEN
    RAISE EXCEPTION 'You can book at most 10 tickets per event.';
  END IF;

  SELECT count(*), array_agg(s.row_label || s.seat_no::text ORDER BY s.row_no, s.seat_no)
  INTO v_found, v_labels
  FROM public.seats s
  WHERE s.id = ANY (p_seat_ids) AND s.tier_id = v_tier.id;
  IF v_found <> v_qty THEN
    RAISE EXCEPTION 'One or more seats do not belong to this ticket type.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seats s WHERE s.id = ANY (p_seat_ids) AND s.blocked)
     OR EXISTS (SELECT 1 FROM public.booking_seats bs WHERE bs.seat_id = ANY (p_seat_ids)) THEN
    RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
  END IF;

  IF v_tier.capacity - v_tier.sold < v_qty THEN
    RAISE EXCEPTION 'Only % seat(s) left for this option.', v_tier.capacity - v_tier.sold;
  END IF;

  SELECT value::numeric INTO v_rate FROM public.payment_settings WHERE key = 'kzt_per_usd';
  SELECT value::integer INTO v_hold FROM public.payment_settings WHERE key = 'hold_minutes';
  v_free := v_tier.price_cents = 0;

  UPDATE public.ticket_tiers SET sold = sold + v_qty WHERE id = v_tier.id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.bookings (
    booking_code, event_id, tier_id, quantity,
    unit_price_cents, total_cents, total_kzt,
    customer_name, customer_email, user_id, seat_labels,
    status, hold_expires_at
  ) VALUES (
    v_code, v_tier.event_id, v_tier.id, v_qty,
    v_tier.price_cents, v_tier.price_cents * v_qty,
    round(v_tier.price_cents * v_qty * v_rate / 100.0)::integer,
    v_name, v_email, auth.uid(), v_labels,
    CASE WHEN v_free THEN 'confirmed' ELSE 'pending' END,
    CASE WHEN v_free THEN NULL ELSE now() + make_interval(mins => coalesce(v_hold, 10)) END
  ) RETURNING * INTO v_booking;

  BEGIN
    INSERT INTO public.booking_seats (seat_id, booking_id)
    SELECT x, v_booking.id FROM unnest(p_seat_ids) AS x;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Some of these seats were just taken. Please choose other seats.';
  END;

  RETURN public._booking_json(v_booking);
END;
$$;

-- 4. Seats are freed on cancel AND when an unpaid hold expires ------------------------------
CREATE OR REPLACE FUNCTION public.release_seats_on_cancel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'expired') AND OLD.status IN ('confirmed', 'pending') THEN
    DELETE FROM public.booking_seats WHERE booking_id = NEW.id;

    -- Booking made before the seat map existed: it holds no seat rows, so free the same
    -- number of blocked seats. Keeps  sold = blocked + booked  true.
    IF cardinality(NEW.seat_labels) = 0 THEN
      UPDATE public.seats SET blocked = false
      WHERE id IN (
        SELECT id FROM public.seats WHERE tier_id = NEW.tier_id AND blocked LIMIT NEW.quantity
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_seats_on_cancel ON public.bookings;
CREATE TRIGGER trg_release_seats_on_cancel
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.release_seats_on_cancel();

-- 5. Late payment: take the same seats back or refund --------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_payment(
  p_payment_id uuid,
  p_provider_ref text,
  p_amount_kzt integer,
  p_secret text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_booking public.bookings;
  v_tier public.ticket_tiers;
  v_starts timestamptz;
  v_refund_all boolean := false;
  v_seat_ids uuid[];
  v_seats_ok boolean := true;
BEGIN
  PERFORM public._require_backend(p_secret);

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found.';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_pay.booking_id FOR UPDATE;

  IF v_pay.status = 'paid' THEN
    RETURN public._booking_json(v_booking);
  END IF;
  IF p_amount_kzt IS DISTINCT FROM v_pay.amount_kzt THEN
    RAISE EXCEPTION 'Paid amount does not match the order.';
  END IF;

  IF v_booking.status = 'pending' THEN
    UPDATE public.bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = v_booking.id;

  ELSIF v_booking.status = 'expired' THEN
    -- The money arrived after the hold was released: take the tickets back if they are still free.
    SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = v_booking.tier_id FOR UPDATE;
    SELECT starts_at INTO v_starts FROM public.events WHERE id = v_booking.event_id;
    IF cardinality(v_booking.seat_labels) > 0 THEN
      -- Seat booking: the same seats must still be free, otherwise the money goes back.
      SELECT array_agg(s.id) INTO v_seat_ids
      FROM public.seats s
      WHERE s.tier_id = v_booking.tier_id
        AND (s.row_label || s.seat_no::text) = ANY (v_booking.seat_labels)
        AND NOT s.blocked
        AND NOT EXISTS (SELECT 1 FROM public.booking_seats bs WHERE bs.seat_id = s.id);
      v_seats_ok := coalesce(cardinality(v_seat_ids), 0) = v_booking.quantity;
    END IF;

    IF v_starts > now() AND v_tier.capacity - v_tier.sold >= v_booking.quantity AND v_seats_ok THEN
      IF v_seat_ids IS NOT NULL THEN
        INSERT INTO public.booking_seats (seat_id, booking_id)
        SELECT x, v_booking.id FROM unnest(v_seat_ids) AS x;
      END IF;
      UPDATE public.ticket_tiers SET sold = sold + v_booking.quantity WHERE id = v_tier.id;
      UPDATE public.bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = v_booking.id;
    ELSE
      v_refund_all := true;
    END IF;

  ELSE
    -- already confirmed by another payment, or cancelled: give the money back
    v_refund_all := true;
  END IF;

  UPDATE public.payments
  SET status = 'paid',
      paid_at = now(),
      updated_at = now(),
      failure_reason = NULL,
      provider_ref = coalesce(p_provider_ref, provider_ref),
      refund_percent = CASE WHEN v_refund_all THEN 100 ELSE refund_percent END,
      refund_kzt = CASE WHEN v_refund_all THEN amount_kzt ELSE refund_kzt END,
      refund_status = CASE WHEN v_refund_all AND amount_kzt > 0 THEN 'pending' ELSE refund_status END
  WHERE id = v_pay.id;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking.id;
  RETURN public._booking_json(v_booking);
END;
$$;

-- 6. Permissions (functions above were replaced, so set them again) ------------------------
REVOKE EXECUTE ON FUNCTION public._booking_json(public.bookings), public.release_seats_on_cancel()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.get_booking(text, text), public.create_booking(uuid, integer, text, text),
  public.create_booking_with_seats(uuid, uuid[], text, text),
  public.confirm_payment(uuid, text, integer, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_booking(text, text), public.create_booking(uuid, integer, text, text),
  public.create_booking_with_seats(uuid, uuid[], text, text),
  public.confirm_payment(uuid, text, integer, text)
TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings() TO authenticated;
