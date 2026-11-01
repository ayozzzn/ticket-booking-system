import { AlertCircle, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import EventCard from '@/components/EventCard';
import { fetchEvents } from '@/lib/bookingApi';
import type { EventRecord } from '@/types/ticketing';

const ALL_CATEGORIES = 'All';

export default function EventCatalog() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setEvents(await fetchEvents());
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(events.map((event) => event.category))).sort()],
    [events],
  );

  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCategory = category === ALL_CATEGORIES || event.category === category;
      const matchesQuery =
        needle === '' ||
        [event.title, event.venue, event.city].some((value) => value.toLowerCase().includes(needle));
      return matchesCategory && matchesQuery;
    });
  }, [events, query, category]);

  const clearFilters = () => {
    setQuery('');
    setCategory(ALL_CATEGORIES);
  };

  return (
    <div>
      <section className="border-b border-stone-200 bg-gradient-to-b from-stone-100 to-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="animate-fade-up text-sm font-semibold uppercase tracking-[0.2em] text-teal-800">
            Live events, reserved in seconds
          </p>
          <h1 className="animate-fade-up mt-4 max-w-3xl font-display text-4xl leading-[1.15] text-stone-900 sm:text-5xl lg:text-6xl [animation-delay:80ms]">
            Find your next unforgettable night out.
          </h1>
          <p className="animate-fade-up mt-5 max-w-2xl text-lg leading-relaxed text-stone-600 [animation-delay:160ms]">
            Concerts, theatre, festivals and conferences. Pick your seats, confirm in one step and keep your booking
            code for the door.
          </p>

          <div className="animate-fade-up mt-10 flex flex-col gap-4 [animation-delay:240ms]">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by event, venue or city"
                aria-label="Search events"
                className="w-full rounded-2xl border border-stone-300 bg-white py-4 pl-12 pr-4 text-stone-900 shadow-sm placeholder:text-stone-400 transition focus:border-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-700/15"
              />
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {categories.map((item) => {
                const isActive = item === category;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setCategory(item)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-stone-900 text-white shadow-sm'
                        : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {status === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-24 text-stone-500" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading events...
          </div>
        )}

        {status === 'error' && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center ring-1 ring-rose-200">
            <AlertCircle className="h-8 w-8 text-rose-700" aria-hidden="true" />
            <p className="text-stone-700">{errorMessage}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="mb-8 flex items-center justify-between">
              <p className="text-sm text-stone-600">
                {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
              </p>
            </div>

            {visibleEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-white py-16 text-center ring-1 ring-stone-200">
                <p className="font-display text-2xl text-stone-900">No events match your search</p>
                <p className="text-stone-600">Try a different keyword or category.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {visibleEvents.map((event, index) => (
                  <div
                    key={event.id}
                    className="animate-fade-up"
                    style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
                  >
                    <EventCard event={event} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
