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
      <section className="border-b border-gold/15">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="animate-fade-up text-base font-medium text-cream-dim">
            Live events, reserved in seconds
          </p>
          <h1 className="animate-fade-up mt-4 max-w-4xl font-display text-6xl font-medium leading-[0.95] text-gold sm:text-7xl lg:text-8xl [animation-delay:80ms]">
            Tonight is yours to book.
          </h1>
          <p className="animate-fade-up mt-6 max-w-2xl text-lg leading-relaxed text-cream-dim [animation-delay:160ms]">
            Concerts, theatre, festivals and conferences. Pick your seats, confirm in one step and keep your booking
            code for the door.
          </p>

          <div className="animate-fade-up mt-10 flex flex-col gap-5 [animation-delay:240ms]">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-cream/50" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by event, venue or city"
                aria-label="Search events"
                className="w-full rounded-full border border-gold/35 bg-cream/10 py-4 pl-13 pr-5 pl-14 text-cream placeholder:text-cream/50 transition focus:border-gold focus:outline-none focus:ring-4 focus:ring-gold/15"
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
                    className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-crimson text-cream shadow-sm'
                        : 'text-cream-dim ring-1 ring-gold/35 hover:text-cream hover:ring-gold'
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
          <div className="flex items-center justify-center gap-3 py-24 text-cream-dim" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading events...
          </div>
        )}

        {status === 'error' && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-cream p-8 text-center text-wine-900">
            <AlertCircle className="h-8 w-8 text-crimson" aria-hidden="true" />
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="mb-8 flex items-center justify-between">
              <p className="text-sm text-gold">
                {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
              </p>
            </div>

            {visibleEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-cream py-16 text-center text-wine-900">
                <p className="font-display text-3xl font-semibold">No events match your search</p>
                <p className="text-wine-900/75">Try a different keyword or category.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright"
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