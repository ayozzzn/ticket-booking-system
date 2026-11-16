import { CalendarDays, Loader2, LogOut, MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import BookingActions from '@/components/BookingActions';
import BookingReceiptCard from '@/components/BookingReceiptCard';
import BookingStatusBadge from '@/components/BookingStatusBadge';
import { useSession } from '@/hooks/useSession';
import { isCancelled } from '@/lib/bookingStatus';
import { formatEventDate, formatEventTime, formatPrice } from '@/lib/format';
import { fetchMyBookings, fetchProfile, updateProfileName } from '@/lib/myBookingsApi';
import { supabase } from '@/lib/supabase';
import type { BookingReceipt } from '@/types/ticketing';

type TabId = 'upcoming' | 'past' | 'cancelled';

const TAB_LABELS: Record<TabId, string> = {
  upcoming: 'Upcoming',
  past: 'Past',
  cancelled: 'Cancelled',
};

const EMPTY_TEXT: Record<TabId, string> = {
  upcoming: 'You have no upcoming bookings.',
  past: 'Events you attended will show up here.',
  cancelled: 'You have not cancelled any bookings.',
};

export default function ProfilePage() {
  const { session, loading: sessionLoading } = useSession();
  const user = session?.user ?? null;
  const userId = user?.id;

  const [bookings, setBookings] = useState<BookingReceipt[]>([]);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<TabId>('upcoming');
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, profile] = await Promise.all([fetchMyBookings(), fetchProfile()]);
      setBookings(list);
      setFullName(profile?.full_name ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  const groups = useMemo(() => {
    const now = Date.now();
    const upcoming: BookingReceipt[] = [];
    const past: BookingReceipt[] = [];
    const cancelled: BookingReceipt[] = [];

    for (const b of bookings) {
      if (isCancelled(b)) cancelled.push(b);
      else if (new Date(b.event_starts_at).getTime() > now) upcoming.push(b);
      else past.push(b);
    }

    const start = (b: BookingReceipt) => new Date(b.event_starts_at).getTime();
    upcoming.sort((a, b) => start(a) - start(b));
    past.sort((a, b) => start(b) - start(a));
    cancelled.sort((a, b) => start(b) - start(a));
    return { upcoming, past, cancelled };
  }, [bookings]);

  function handleUpdated(updated: BookingReceipt) {
    setBookings((prev) => prev.map((b) => (b.booking_code === updated.booking_code ? updated : b)));
    setNotice(
      `Booking ${updated.booking_code} was cancelled. ${updated.quantity} ${
        updated.quantity === 1 ? 'ticket was' : 'tickets were'
      } released.`,
    );
    setTab('cancelled');
  }

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSavingName(true);
    setError('');
    try {
      const value = nameDraft.trim();
      await updateProfileName(userId, value);
      setFullName(value);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.hash = '#/';
  }

  if (sessionLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-cream-dim">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-3xl bg-cream p-8 text-center text-wine-900 shadow-xl shadow-black/40">
          <h1 className="font-display text-4xl font-semibold text-wine-900">Please log in</h1>
          <p className="mt-3 text-wine-900/75">Log in to see your tickets and manage your bookings.</p>
          <a
            href="#/login"
            className="mt-6 inline-block rounded-full bg-crimson px-6 py-3 font-semibold text-cream transition hover:bg-crimson-bright"
          >
            Log in
          </a>
          <p className="mt-4 text-sm text-wine-900/70">
            No account?{' '}
            <a href="#/register" className="font-medium text-crimson underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    );
  }

  const displayName = fullName || user.email || 'Your account';
  const initial = displayName.charAt(0).toUpperCase();
  const list = groups[tab];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-cream p-6 text-wine-900 shadow-xl shadow-black/40">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-crimson font-display text-3xl text-cream"
          >
            {initial}
          </span>
          <div className="min-w-0">
            {editing ? (
              <form onSubmit={handleSaveName} className="flex flex-wrap items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={120}
                  required
                  aria-label="Full name"
                  className="w-56 rounded-xl border border-wine-900/25 bg-white px-3 py-2 text-sm text-wine-900 outline-none focus:border-crimson focus:ring-4 focus:ring-crimson/15"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="rounded-full bg-crimson px-4 py-2 text-sm font-semibold text-cream hover:bg-crimson-bright disabled:opacity-60"
                >
                  {savingName ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-full px-4 py-2 text-sm text-wine-900/70 hover:bg-wine-900/10"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <h1 className="truncate font-display text-3xl font-semibold text-wine-900">{displayName}</h1>
                <p className="truncate text-sm text-wine-900/70">{user.email}</p>
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(fullName);
                    setEditing(true);
                  }}
                  className="mt-1 text-sm font-medium text-crimson underline"
                >
                  Change name
                </button>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-wine-900/75 ring-1 ring-wine-900/25 transition hover:bg-wine-900/10 hover:text-wine-900"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </section>

      <h2 className="mt-10 font-display text-4xl font-medium text-gold">My tickets</h2>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Booking status">
        {(Object.keys(TAB_LABELS) as TabId[]).map((id) => {
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-crimson text-cream'
                  : 'text-cream-dim ring-1 ring-gold/35 hover:text-cream hover:ring-gold'
              }`}
            >
              {TAB_LABELS[id]} ({groups[id].length})
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          role="status"
          className="mt-5 flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="font-medium underline">
            Close
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-8 flex items-center gap-3 text-cream-dim" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading your tickets...
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="mt-6 rounded-2xl bg-cream p-8 text-center text-wine-900">
          <p className="text-wine-900/75">{EMPTY_TEXT[tab]}</p>
          {tab === 'upcoming' && (
            <a
              href="#/"
              className="mt-4 inline-block rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream hover:bg-crimson-bright"
            >
              Browse events
            </a>
          )}
        </div>
      )}

      <div className="mt-6 space-y-5">
        {list.map((b) => {
          const open = openCode === b.booking_code;
          return (
            <article
              key={b.booking_code}
              className="overflow-hidden rounded-2xl bg-cream text-wine-900 shadow-xl shadow-black/40"
            >
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl font-semibold text-crimson">{b.event_title}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-wine-900/75">
                      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {formatEventDate(b.event_starts_at)} · {formatEventTime(b.event_starts_at)}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-wine-900/75">
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {b.event_venue}, {b.event_city}
                      </span>
                    </p>
                  </div>
                  <BookingStatusBadge status={b.status} />
                </div>
              </div>

              {/* Ticket stub */}
              <div className="relative flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-crimson/35 px-5 py-4 text-sm before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-wine-950 after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-wine-950">
                <p className="text-wine-900/75">
                  {b.quantity} × {b.tier_name} ·{' '}
                  <span className="font-semibold text-wine-900">{formatPrice(b.total_cents)}</span>
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs tracking-widest text-wine-900/60">{b.booking_code}</span>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenCode(open ? null : b.booking_code)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-crimson ring-1 ring-crimson/35 transition hover:bg-crimson/10"
                  >
                    {open ? 'Hide details' : tab === 'upcoming' ? 'Details and cancel' : 'Details'}
                  </button>
                </div>
              </div>

              {open && (
                <div className="space-y-6 border-t border-wine-900/10 p-5">
                  <BookingReceiptCard receipt={b} />
                  <BookingActions
                    receipt={b}
                    email={user.email ?? undefined}
                    accountMode
                    onUpdated={handleUpdated}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}