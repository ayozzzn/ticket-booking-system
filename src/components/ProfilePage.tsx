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
    return <div className="mx-auto max-w-3xl px-4 py-12 text-stone-600">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl text-stone-900">Please log in</h1>
        <p className="mt-3 text-stone-600">Log in to see your tickets and manage your bookings.</p>
        <a href="#/login" className="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-white">
          Log in
        </a>
        <p className="mt-4 text-sm text-stone-600">
          No account?{' '}
          <a href="#/register" className="underline">
            Sign up
          </a>
        </p>
      </div>
    );
  }

  const displayName = fullName || user.email || 'Your account';
  const initial = displayName.charAt(0).toUpperCase();
  const list = groups[tab];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-6 ring-1 ring-stone-200">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-800 font-display text-2xl text-white"
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
                  className="w-56 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingName ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <h1 className="truncate font-display text-2xl text-stone-900">{displayName}</h1>
                <p className="truncate text-sm text-stone-600">{user.email}</p>
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(fullName);
                    setEditing(true);
                  }}
                  className="mt-1 text-sm font-medium text-teal-800 underline"
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
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-stone-600 ring-1 ring-stone-300 transition hover:bg-stone-100 hover:text-stone-900"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </section>

      <h2 className="mt-10 font-display text-2xl text-stone-900">My tickets</h2>

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
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100'
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
        <div role="alert" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-8 flex items-center gap-3 text-stone-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading your tickets...
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          <p className="text-stone-600">{EMPTY_TEXT[tab]}</p>
          {tab === 'upcoming' && (
            <a
              href="#/"
              className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700"
            >
              Browse events
            </a>
          )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {list.map((b) => {
          const open = openCode === b.booking_code;
          return (
            <article key={b.booking_code} className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-xl text-stone-900">{b.event_title}</h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-stone-600">
                    <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {formatEventDate(b.event_starts_at)} · {formatEventTime(b.event_starts_at)}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-stone-600">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {b.event_venue}, {b.event_city}
                    </span>
                  </p>
                </div>
                <BookingStatusBadge status={b.status} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 text-sm">
                <p className="text-stone-600">
                  {b.quantity} × {b.tier_name} ·{' '}
                  <span className="font-semibold text-stone-900">{formatPrice(b.total_cents)}</span>
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs tracking-widest text-stone-500">{b.booking_code}</span>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenCode(open ? null : b.booking_code)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-teal-800 ring-1 ring-teal-700/30 transition hover:bg-teal-50"
                  >
                    {open ? 'Hide details' : tab === 'upcoming' ? 'Details and cancel' : 'Details'}
                  </button>
                </div>
              </div>

              {open && (
                <div className="mt-5 space-y-6 border-t border-stone-100 pt-5">
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