-- Stagepass Admin Panel security and permissions.
-- Run this migration in Supabase SQL Editor AFTER the existing migrations.
-- Then create an admin user in Authentication > Users and run the INSERT below
-- with that user's actual UUID. Never put a service_role key in the frontend.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT SELECT ON public.admin_users TO authenticated;

DROP POLICY IF EXISTS "admins_can_read_own_admin_role" ON public.admin_users;
CREATE POLICY "admins_can_read_own_admin_role" ON public.admin_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admin-only write access for event and ticket management.
DROP POLICY IF EXISTS "admins_manage_events" ON public.events;
CREATE POLICY "admins_manage_events" ON public.events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()));

DROP POLICY IF EXISTS "admins_manage_ticket_tiers" ON public.ticket_tiers;
CREATE POLICY "admins_manage_ticket_tiers" ON public.ticket_tiers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()));

-- Booking data is private to administrators. Customers continue using the
-- SECURITY DEFINER RPC functions with booking code + email.
GRANT SELECT ON public.bookings TO authenticated;
DROP POLICY IF EXISTS "admins_read_bookings" ON public.bookings;
CREATE POLICY "admins_read_bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()));

-- Bootstrap exactly one administrator after creating the user in Supabase Auth:
-- INSERT INTO public.admin_users (user_id) VALUES ('PASTE_AUTH_USER_UUID_HERE');
