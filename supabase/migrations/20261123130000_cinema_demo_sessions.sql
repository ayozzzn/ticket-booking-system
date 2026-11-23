/*
# Demo sessions for movies (optional)

Run after 20261123120000_cinema_sessions.sql if you want the movie pages to have sessions
right away. Safe to run more than once: a movie that already has sessions is skipped.

For every event whose category looks like cinema (Cinema, Movie, Film, Кино) it creates
sessions for the next 7 days in Almaty cinemas, 3 per day, each with a 8 x 12 seat map and
three ticket types: Adult, Student, Child. Evening and IMAX sessions cost more.
These are sample times and prices, not real schedules: edit or delete them in Admin > Sessions.
*/
DO $$
DECLARE
  v_movie record;
  v_day integer;
  v_slot integer;
  v_cinema record;
  v_cinemas uuid[];
  v_times text[] := ARRAY['11:00', '13:40', '16:20', '19:00', '21:45'];
  v_time text;
  v_starts timestamptz;
  v_format text;
  v_adult integer;
  v_tier uuid;
  v_rate numeric := (SELECT value::numeric FROM public.payment_settings WHERE key = 'kzt_per_usd');
  v_today date := (now() AT TIME ZONE 'Asia/Almaty')::date;
  v_n integer := 0;
BEGIN
  SELECT array_agg(id ORDER BY name) INTO v_cinemas FROM public.cinemas WHERE is_active;
  IF v_cinemas IS NULL THEN
    RAISE NOTICE 'No cinemas yet: run 20261123120000_cinema_sessions.sql first.';
    RETURN;
  END IF;

  FOR v_movie IN
    SELECT e.id, row_number() OVER (ORDER BY e.title) AS k
    FROM public.events e
    WHERE (e.category ILIKE 'cinema%' OR e.category ILIKE 'movie%' OR e.category ILIKE 'film%' OR e.category ILIKE 'кино%')
      AND NOT EXISTS (SELECT 1 FROM public.ticket_tiers t WHERE t.event_id = e.id AND t.starts_at IS NOT NULL)
  LOOP
    UPDATE public.events
    SET age_rating = coalesce(age_rating, (ARRAY['6+', '12+', '16+', '0+'])[1 + v_movie.k % 4]),
        duration_minutes = coalesce(duration_minutes, 95 + (v_movie.k * 13) % 50)
    WHERE id = v_movie.id;

    FOR v_day IN 0..6 LOOP
      FOR v_slot IN 1..3 LOOP
        SELECT * INTO v_cinema FROM public.cinemas
        WHERE id = v_cinemas[1 + ((v_movie.k + v_day + v_slot * 3) % cardinality(v_cinemas))];
        v_time := v_times[1 + ((v_movie.k + v_day + v_slot * 2) % 5)];
        v_starts := ((v_today + v_day)::text || ' ' || v_time || ':00+05')::timestamptz;
        CONTINUE WHEN v_starts < now() + interval '30 minutes';
        v_format := CASE WHEN v_cinema.name ILIKE '%IMAX%' AND v_slot = 2 THEN 'IMAX'
                         WHEN v_slot = 3 THEN '3D' ELSE '2D' END;
        v_adult := CASE WHEN v_time >= '17:00' THEN 3000 ELSE 2300 END
                   + CASE v_format WHEN 'IMAX' THEN 1500 WHEN '3D' THEN 500 ELSE 0 END;
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM public.ticket_tiers
          WHERE event_id = v_movie.id AND cinema_id = v_cinema.id AND starts_at = v_starts
        );

        INSERT INTO public.ticket_tiers (event_id, name, description, price_cents, capacity,
                                         cinema_id, starts_at, hall, format, language)
        VALUES (v_movie.id, 'Hall ' || (1 + (v_day + v_slot) % 6) || ' · ' || v_format,
                CASE WHEN v_slot = 2 THEN 'KZ' ELSE 'RU' END,
                round((v_adult - 800) * 100.0 / v_rate)::integer, 96,
                v_cinema.id, v_starts, 'Hall ' || (1 + (v_day + v_slot) % 6), v_format,
                CASE WHEN v_slot = 2 THEN 'KZ' ELSE 'RU' END)
        RETURNING id INTO v_tier;

        INSERT INTO public.tier_fares (tier_id, name, price_kzt, note, sort_order) VALUES
          (v_tier, 'Adult', v_adult, '', 1),
          (v_tier, 'Student', v_adult - 600, 'Show your student ID at the entrance', 2),
          (v_tier, 'Child', v_adult - 800, 'Children aged 3 to 12', 3);

        PERFORM public.generate_tier_seats(v_tier, 12);
        v_n := v_n + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Created % demo sessions.', v_n;
END
$$;
