import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { fetchMyBookings } from '@/lib/myBookingsApi';
import type { BookingReceipt } from '@/types/ticketing';

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MyBookingsPage() {
  const { session, loading: sessionLoading } = useSession();
  const [bookings, setBookings] = useState<BookingReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    fetchMyBookings()
      .then(setBookings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  if (sessionLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-stone-600">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl text-stone-900">Please log in</h1>
        <p className="mt-3 text-stone-600">Log in to see your tickets.</p>
        <a
          href="#/login"
          className="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-white"
        >
          Log in
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl text-stone-900">My tickets</h1>
      <p className="mt-2 text-stone-600">
        Bookings made with {session.user.email}
      </p>

      {loading && <p className="mt-8 text-stone-600">Loading your tickets...</p>}
      {error && <p className="mt-8 text-red-600">{error}</p>}

      {!loading && !error && bookings.length === 0 && (
        <p className="mt-8 text-stone-600">
          You have no bookings yet. Book an event using this email and it will appear here.
        </p>
      )}

      <div className="mt-8 space-y-4">
        {bookings.map((b) => (
          <div
            key={b.booking_code}
            className="rounded-xl border border-stone-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-xl text-stone-900">{b.event_title}</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {new Date(b.event_starts_at).toLocaleString()} · {b.event_venue}, {b.event_city}
                </p>
              </div>
              <span className="rounded-full bg-stone-900 px-3 py-1 text-sm font-medium text-white">
                {b.booking_code}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-stone-500">Ticket</p>
                <p className="font-medium text-stone-900">{b.tier_name}</p>
              </div>
              <div>
                <p className="text-stone-500">Quantity</p>
                <p className="font-medium text-stone-900">{b.quantity}</p>
              </div>
              <div>
                <p className="text-stone-500">Total</p>
                <p className="font-medium text-stone-900">{money(b.total_cents)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}