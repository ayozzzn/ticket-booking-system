# ticket-booking-system

## Admin Panel

Open `#/admin` (or click **Admin** in the site navigation). The admin UI supports:
- Admin sign-in through Supabase Auth and an `admin_users` allow-list.
- Dashboard totals and recent bookings.
- Create, edit and delete events.
- View ticket inventory and create ticket tiers.
- View recent booking records.

### Enable administrator access
1. Run `supabase/migrations/20261102180000_admin_panel.sql` in the Supabase SQL Editor after the other migrations.
2. In Supabase Dashboard, open Authentication → Users and create an administrator account.
3. Copy that user's UUID and run this SQL (replace the placeholder with the real UUID):
   `INSERT INTO public.admin_users (user_id) VALUES ('PASTE_AUTH_USER_UUID_HERE');`
4. Sign in at `#/admin` using that email and password.

The admin UI is not authorized by hiding a route: the database migration adds RLS policies so only users listed in `admin_users` can write events/ticket tiers or read bookings. Do not expose a Supabase `service_role` key in frontend code.

Note: event deletion is blocked by the database when bookings reference that event. Payment processing is not implemented; dashboard revenue is the sum of confirmed booking values, not verified payments.
