-- Checks for event reviews. Changes nothing: everything is rolled back. Every line should say "ok".
BEGIN;
DO $$
DECLARE
  v_event uuid := (SELECT id FROM events ORDER BY starts_at LIMIT 1);
  v_tier uuid;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); v_admin uuid := gen_random_uuid();
  r jsonb; s jsonb; v_id uuid; v_err text;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u1, 'aruzhan@example.com', '{"full_name":"Aruzhan Bekova"}'),
    (u2, 'dias@example.com', '{"full_name":"Dias"}'),
    (u3, 'nobody@example.com', '{}'),
    (v_admin, 'admin@example.com', '{"full_name":"Admin Person"}');
  INSERT INTO admin_users (user_id) VALUES (v_admin);

  -- 1. guests cannot write
  BEGIN
    PERFORM save_event_review(v_event, 5, '😍', 'Great');
    RAISE EXCEPTION 'guest wrote a review';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 1 guests cannot write reviews';

  -- 2. write, short name, average on the event
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  r := save_event_review(v_event, 5, '😍', '  Loved every minute!  ');
  ASSERT r->>'display_name' = 'Aruzhan B.', 'name should be shortened: ' || (r->>'display_name');
  ASSERT r->>'comment' = 'Loved every minute!' AND (r->>'mine')::boolean, 'review json wrong';
  v_id := (r->>'id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u2)::text, true);
  PERFORM save_event_review(v_event, 2, '😴', '');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u3)::text, true);
  r := save_event_review(v_event, 4, NULL, 'Good');
  ASSERT r->>'display_name' = 'Kesh user', 'fallback name wrong';
  ASSERT (SELECT rating_count FROM events WHERE id = v_event) = 3, 'count not updated';
  ASSERT (SELECT rating_avg FROM events WHERE id = v_event) = 3.67, 'avg wrong: ' || (SELECT rating_avg FROM events WHERE id = v_event);
  RAISE NOTICE 'ok 2 reviews saved, names shortened, event average updated';

  -- 3. second save = edit (still one review per user)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u2)::text, true);
  PERFORM save_event_review(v_event, 3, '😂', 'Changed my mind, it was fun');
  ASSERT (SELECT count(*) FROM event_reviews WHERE event_id = v_event AND user_id = u2) = 1, 'duplicate review';
  ASSERT (SELECT rating_avg FROM events WHERE id = v_event) = 4.00, 'avg not updated on edit';
  RAISE NOTICE 'ok 3 saving again edits the review';

  -- 4. bad input
  BEGIN PERFORM save_event_review(v_event, 6, NULL, ''); RAISE EXCEPTION 'rating 6 allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT; ASSERT v_err LIKE 'Please choose from 1 to 5%', v_err; END;
  BEGIN PERFORM save_event_review(v_event, 4, '💩', ''); RAISE EXCEPTION 'unknown mood allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT; ASSERT v_err = 'Unknown mood.', v_err; END;
  BEGIN PERFORM save_event_review(v_event, 4, NULL, repeat('a', 1001)); RAISE EXCEPTION 'long text allowed';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT; ASSERT v_err LIKE 'A review can be up to%', v_err; END;
  RAISE NOTICE 'ok 4 bad rating, mood and text are refused';

  -- 5. reactions: toggle, not on own review
  r := toggle_review_reaction(v_id, '👍');
  ASSERT (r->'reactions'->>'👍')::int = 1 AND r->'my_reactions' ? '👍', 'reaction not added';
  r := toggle_review_reaction(v_id, '🔥');
  r := toggle_review_reaction(v_id, '👍');
  ASSERT r->'reactions'->>'👍' IS NULL AND (r->'reactions'->>'🔥')::int = 1, 'toggle off failed';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  BEGIN PERFORM toggle_review_reaction(v_id, '❤️'); RAISE EXCEPTION 'reacted to own review';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT; ASSERT v_err LIKE 'You cannot react to your own%', v_err; END;
  RAISE NOTICE 'ok 5 reactions toggle on and off, not on your own review';

  -- 6. summary
  s := get_event_reviews(v_event);
  ASSERT (s->'summary'->>'count')::int = 3 AND (s->'summary'->'distribution'->>'5')::int = 1, 'summary wrong';
  ASSERT (s->'summary'->'moods'->>'😍')::int = 1, 'moods wrong';
  ASSERT jsonb_array_length(s->'reviews') = 3 AND NOT (s->>'can_moderate')::boolean, 'list wrong';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(s->'reviews') x WHERE (x->>'mine')::boolean) = 1, 'mine flag wrong';
  RAISE NOTICE 'ok 6 summary: count, average, star bars, moods';

  -- 7. verified ticket badge
  SELECT id INTO v_tier FROM ticket_tiers WHERE event_id = v_event LIMIT 1;
  INSERT INTO bookings (booking_code, event_id, tier_id, quantity, unit_price_cents, total_cents, customer_name, customer_email, status)
  VALUES ('REVIEWCHK1', v_event, v_tier, 1, 0, 0, 'Aruzhan', 'aruzhan@example.com', 'confirmed');
  s := get_event_reviews(v_event);
  ASSERT (SELECT (x->>'verified')::boolean FROM jsonb_array_elements(s->'reviews') x WHERE x->>'id' = v_id::text), 'buyer not verified';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(s->'reviews') x WHERE (x->>'verified')::boolean) = 1, 'non-buyer verified';
  RAISE NOTICE 'ok 7 buyers get the verified ticket badge';

  -- 8. delete: others cannot, admin can, author can
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u3)::text, true);
  BEGIN PERFORM delete_event_review(v_id); RAISE EXCEPTION 'deleted someone else''s review';
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT; ASSERT v_err LIKE 'You can only delete%', v_err; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  ASSERT (get_event_reviews(v_event)->>'can_moderate')::boolean, 'admin cannot moderate';
  PERFORM delete_event_review(v_id);
  ASSERT (SELECT rating_count FROM events WHERE id = v_event) = 2, 'count not updated on delete';
  ASSERT NOT EXISTS (SELECT 1 FROM review_reactions WHERE review_id = v_id), 'reactions left behind';
  RAISE NOTICE 'ok 8 only the author or an admin deletes, average follows';

  -- 9. the website feedback table is untouched
  ASSERT to_regclass('public.feedback') IS NOT NULL, 'feedback table missing';
  RAISE NOTICE 'ok 9 website feedback table untouched';
END
$$;
ROLLBACK;
