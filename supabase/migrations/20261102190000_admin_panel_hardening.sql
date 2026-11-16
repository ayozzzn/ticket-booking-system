/*
# Admin panel hardening (run AFTER 20261102180000_admin_panel.sql)

1. Explicit table privileges
- authenticated gets INSERT/UPDATE/DELETE on events and ticket_tiers (RLS still limits it to admins).
- anon loses all write privileges. Nobody can write bookings directly.

2. Protect ticket counters
- Trigger blocks anon/authenticated users from setting ticket_tiers.sold / baseline_sold.
  Only SECURITY DEFINER booking functions (owner role) may change them.

3. Admin-only statistics
- is_admin() and admin_event_stats(): statistics for admins without opening the private views.
*/

-- 1. Privileges ---------------------------------------------------------------
GRANT INSERT, UPDATE, DELETE ON public.events, public.ticket_tiers TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.events, public.ticket_tiers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bookings FROM anon, authenticated;
REVOKE ALL ON public.bookings FROM anon;
GRANT SELECT ON public.bookings TO authenticated;

-- 2. Counter protection -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_sold_counter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND (NEW.sold <> 0 OR NEW.baseline_sold <> 0) THEN
      RAISE EXCEPTION 'Ticket counters are managed by the booking functions only.';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.sold IS DISTINCT FROM OLD.sold
                             OR NEW.baseline_sold IS DISTINCT FROM OLD.baseline_sold) THEN
      RAISE EXCEPTION 'Ticket counters are managed by the booking functions only.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sold_counter ON public.ticket_tiers;
CREATE TRIGGER trg_protect_sold_counter
  BEFORE INSERT OR UPDATE ON public.ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.protect_sold_counter();

-- 3. Admin helpers ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.admin_event_stats()
RETURNS SETOF public.v_event_stats
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.v_event_stats ORDER BY starts_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_event_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_event_stats() TO authenticated;
