/*
# Reviews for every event (stars, mood emoji, reactions)

Run after the other migrations. Safe to run more than once.
Not the same as 20261123150000_feedback.sql: that table is feedback about the Kesh website,
this one is reviews of a concrete event or movie. The feedback table is not touched.

- event_reviews     one review per user per event: 1-5 stars, optional mood emoji, optional text.
                    Every existing and future event gets reviews automatically (they hang on event_id).
- review_reactions  other users react to a review with an emoji (👍 ❤️ 😂 🔥), one of each per user.
- events.rating_avg / rating_count   kept up to date by a trigger, so cards can show ★ 4.6 (12)
                    without loading every review.
Writing goes only through the functions below (they take the author's name from the profile,
so nobody can post under another name). Reading is public.
"Verified ticket" = the author has a confirmed or used booking for this event.
*/

-- 1. Tables -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  mood text CHECK (mood IS NULL OR mood IN ('😍', '🤩', '😂', '😱', '😢', '😴')),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  display_name text NOT NULL DEFAULT 'Kesh user' CHECK (length(display_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_reviews_event ON public.event_reviews (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_reactions (
  review_id uuid NOT NULL REFERENCES public.event_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '🔥')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id, emoji)
);

ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_reviews, public.review_reactions TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_reviews, public.review_reactions FROM anon, authenticated;
DROP POLICY IF EXISTS "public_read_event_reviews" ON public.event_reviews;
CREATE POLICY "public_read_event_reviews" ON public.event_reviews FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_review_reactions" ON public.review_reactions;
CREATE POLICY "public_read_review_reactions" ON public.review_reactions FOR SELECT TO anon, authenticated USING (true);

-- 2. Average on the event row ------------------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rating_avg numeric(3, 2);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._refresh_event_rating()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event uuid := coalesce(NEW.event_id, OLD.event_id);
BEGIN
  UPDATE public.events e
  SET rating_avg = s.avg, rating_count = s.n
  FROM (SELECT round(avg(rating), 2) AS avg, count(*)::int AS n FROM public.event_reviews WHERE event_id = v_event) s
  WHERE e.id = v_event;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_event_reviews_rating ON public.event_reviews;
CREATE TRIGGER trg_event_reviews_rating
  AFTER INSERT OR UPDATE OF rating OR DELETE ON public.event_reviews
  FOR EACH ROW EXECUTE FUNCTION public._refresh_event_rating();

-- 3. Helpers ------------------------------------------------------------------------------------
-- "Aruzhan Bekova" -> "Aruzhan B." (first name and initial; nobody sees the full name or email).
CREATE OR REPLACE FUNCTION public._review_author_name(p_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH n AS (
    SELECT regexp_split_to_array(coalesce(
      nullif(trim((SELECT full_name FROM public.profiles WHERE id = p_user)), ''),
      nullif(trim((SELECT raw_user_meta_data ->> 'full_name' FROM auth.users WHERE id = p_user)), '')), '\s+') AS parts
  )
  SELECT CASE
    WHEN parts IS NULL THEN 'Kesh user'
    WHEN cardinality(parts) = 1 THEN left(parts[1], 80)
    ELSE left(parts[1] || ' ' || upper(left(parts[cardinality(parts)], 1)) || '.', 80)
  END
  FROM n;
$$;

CREATE OR REPLACE FUNCTION public._review_json(r public.event_reviews, p_viewer uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'rating', r.rating,
    'mood', r.mood,
    'comment', r.comment,
    'display_name', r.display_name,
    'created_at', r.created_at,
    'edited', r.updated_at > r.created_at + interval '1 minute',
    'mine', p_viewer IS NOT NULL AND r.user_id = p_viewer,
    'verified', EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = r.event_id AND b.status = 'confirmed'
        AND (b.user_id = r.user_id
             OR b.customer_email = lower((SELECT email FROM auth.users WHERE id = r.user_id)))
    ),
    'reactions', coalesce((
      SELECT jsonb_object_agg(emoji, n) FROM (
        SELECT emoji, count(*) AS n FROM public.review_reactions WHERE review_id = r.id GROUP BY emoji
      ) x
    ), '{}'::jsonb),
    'my_reactions', coalesce((
      SELECT jsonb_agg(emoji) FROM public.review_reactions WHERE review_id = r.id AND user_id = p_viewer
    ), '[]'::jsonb)
  );
$$;

-- 4. Reading: summary + newest 200 reviews -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_reviews(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'count', (SELECT count(*) FROM public.event_reviews WHERE event_id = p_event_id),
      'average', (SELECT round(avg(rating), 2) FROM public.event_reviews WHERE event_id = p_event_id),
      'distribution', (
        SELECT jsonb_object_agg(s::text, (SELECT count(*) FROM public.event_reviews WHERE event_id = p_event_id AND rating = s))
        FROM generate_series(1, 5) AS s
      ),
      'moods', coalesce((
        SELECT jsonb_object_agg(mood, n) FROM (
          SELECT mood, count(*) AS n FROM public.event_reviews
          WHERE event_id = p_event_id AND mood IS NOT NULL GROUP BY mood
        ) m
      ), '{}'::jsonb)
    ),
    'reviews', coalesce((
      SELECT jsonb_agg(public._review_json(r, auth.uid()) ORDER BY r.created_at DESC)
      FROM (SELECT * FROM public.event_reviews WHERE event_id = p_event_id ORDER BY created_at DESC LIMIT 200) r
    ), '[]'::jsonb),
    'can_moderate', public.is_admin()
  );
$$;

-- 5. Writing ------------------------------------------------------------------------------------
-- Creates the review, or updates it if this user already reviewed the event.
CREATE OR REPLACE FUNCTION public.save_event_review(p_event_id uuid, p_rating integer, p_mood text, p_comment text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comment text := trim(coalesce(p_comment, ''));
  v_mood text := nullif(trim(coalesce(p_mood, '')), '');
  v_review public.event_reviews;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please log in to leave a review.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Event not found.';
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Please choose from 1 to 5 stars.';
  END IF;
  IF v_mood IS NOT NULL AND v_mood NOT IN ('😍', '🤩', '😂', '😱', '😢', '😴') THEN
    RAISE EXCEPTION 'Unknown mood.';
  END IF;
  IF length(v_comment) > 1000 THEN
    RAISE EXCEPTION 'A review can be up to 1000 characters.';
  END IF;
  IF length(v_comment) BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'Write a few more words, or leave the text empty.';
  END IF;

  INSERT INTO public.event_reviews (event_id, user_id, rating, mood, comment, display_name)
  VALUES (p_event_id, v_user, p_rating, v_mood, v_comment, public._review_author_name(v_user))
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating, mood = EXCLUDED.mood, comment = EXCLUDED.comment,
        display_name = EXCLUDED.display_name, updated_at = now()
  RETURNING * INTO v_review;

  RETURN public._review_json(v_review, v_user);
END;
$$;

-- The author deletes their own review; an admin can delete any review.
CREATE OR REPLACE FUNCTION public.delete_event_review(p_review_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please log in.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.event_reviews
  WHERE id = p_review_id AND (user_id = auth.uid() OR public.is_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only delete your own review.';
  END IF;
END;
$$;

-- Press an emoji under a review: on, press again: off. Returns the new counts.
CREATE OR REPLACE FUNCTION public.toggle_review_reaction(p_review_id uuid, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_review public.event_reviews;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please log in to react.' USING ERRCODE = '42501';
  END IF;
  IF p_emoji NOT IN ('👍', '❤️', '😂', '🔥') THEN
    RAISE EXCEPTION 'Unknown reaction.';
  END IF;
  SELECT * INTO v_review FROM public.event_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;
  IF v_review.user_id = v_user THEN
    RAISE EXCEPTION 'You cannot react to your own review.';
  END IF;

  DELETE FROM public.review_reactions WHERE review_id = p_review_id AND user_id = v_user AND emoji = p_emoji;
  IF NOT FOUND THEN
    INSERT INTO public.review_reactions (review_id, user_id, emoji) VALUES (p_review_id, v_user, p_emoji);
  END IF;

  RETURN public._review_json(v_review, v_user);
END;
$$;

-- 6. Permissions --------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._refresh_event_rating(), public._review_author_name(uuid),
  public._review_json(public.event_reviews, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_event_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_reviews(uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_event_review(uuid, integer, text, text),
  public.delete_event_review(uuid), public.toggle_review_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_review(uuid, integer, text, text),
  public.delete_event_review(uuid), public.toggle_review_reaction(uuid, text) TO authenticated;
