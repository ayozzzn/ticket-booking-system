import { AlertCircle, ChevronRight, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DateStrip from '@/components/DateStrip';
import EventCard from '@/components/EventCard';
import { fetchEvents } from '@/lib/bookingApi';
import { dayKey, longDay } from '@/lib/calendar';
import { eventDays, hasSessions, nextStart, upcomingSessions } from '@/lib/sessions';
import type { EventRecord } from '@/types/ticketing';

const ALL_CATEGORIES = 'All';

export default function EventCatalog() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [day, setDay] = useState<string | null>(null);
  // Movies: show only those playing in this cinema; sort the grid by next session or by title.
  const [cinemaId, setCinemaId] = useState('all');
  const [sort, setSort] = useState<'time' | 'title'>('time');
  const today = dayKey(new Date());

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

  // Only events that have not happened yet (by Almaty date) are shown on the home page.
  // Movies count as upcoming while they have a future session.
  const upcoming = useMemo(
    () =>
      events.filter((event) =>
        hasSessions(event) ? upcomingSessions(event).length > 0 : dayKey(event.starts_at) >= today,
      ),
    [events, today],
  );

  const categories = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(upcoming.map((event) => event.category))).sort()],
    [upcoming],
  );

  // Days an event is on; with a cinema chosen, only the days that cinema shows it.
  const daysFor = useCallback(
    (event: EventRecord) =>
      cinemaId === 'all'
        ? eventDays(event)
        : Array.from(
            new Set(upcomingSessions(event).filter((s) => s.cinema_id === cinemaId).map((s) => dayKey(s.starts_at))),
          ),
    [cinemaId],
  );

  // Search and category filter, but not the date: the date strip shows dots for these.
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return upcoming.filter((event) => {
      const matchesCategory = category === ALL_CATEGORIES || event.category === category;
      const matchesQuery =
        needle === '' ||
        [event.title, event.venue, event.city].some((value) => value.toLowerCase().includes(needle));
      return matchesCategory && matchesQuery && daysFor(event).length > 0;
    });
  }, [upcoming, query, category, daysFor]);

  // Cinemas that show at least one movie in the current category (for the cinema filter).
  const cinemas = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of upcoming) {
      if (category !== ALL_CATEGORIES && event.category !== category) continue;
      for (const s of upcomingSessions(event)) if (s.cinema) map.set(s.cinema.id, s.cinema.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [upcoming, category]);
  const showCinemaFilter = category !== ALL_CATEGORIES && cinemas.length > 0;

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of matching) {
      for (const key of daysFor(event)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [matching, daysFor]);

  const visibleEvents = useMemo(
    () => {
      const list = day ? matching.filter((event) => daysFor(event).includes(day)) : matching;
      return [...list].sort((a, b) =>
        sort === 'title' ? a.title.localeCompare(b.title) : nextStart(a).localeCompare(nextStart(b)),
      );
    },
    [matching, day, sort, daysFor],
  );

  // On "All" the page is split into one row per category, like a poster wall.
  const sections = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    for (const event of visibleEvents) map.set(event.category, [...(map.get(event.category) ?? []), event]);
    return Array.from(map.entries()).sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));
  }, [visibleEvents]);

  const clearFilters = () => {
    setQuery('');
    setCategory(ALL_CATEGORIES);
    setDay(null);
    setCinemaId('all');
  };

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="kesh-hero relative overflow-hidden rounded-[2rem] px-6 py-12 text-cream shadow-2xl shadow-crimson/25 sm:px-12 sm:py-16">
          <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border-[28px] border-cream/10" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full bg-cream/10" />
          <p className="animate-fade-up relative w-fit rounded-full bg-cream/15 px-4 py-1.5 text-sm font-semibold">
            Concerts · Cinema · Theatre · Sports
          </p>
          <h1 className="animate-fade-up relative mt-5 max-w-3xl font-display text-5xl font-bold leading-[1.05] sm:text-6xl [animation-delay:80ms]">
            Tonight is yours to book.
          </h1>
          <p className="animate-fade-up relative mt-5 max-w-2xl text-lg leading-relaxed text-cream/85 [animation-delay:160ms]">
            Pick a date, choose a ticket and pay by card or QR. Your ticket is saved in your profile.
          </p>

          <div className="animate-fade-up relative mt-8 flex flex-col gap-5 [animation-delay:240ms]">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-wine-900/50" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by event, venue or city"
                aria-label="Search events"
                className="w-full rounded-full bg-cream py-4 pl-14 pr-5 text-wine-900 shadow-lg placeholder:text-wine-900/45 transition focus:outline-none focus:ring-4 focus:ring-cream/40"
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
                    onClick={() => { setCategory(item); setCinemaId('all'); }}
                    className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                      isActive ? 'bg-cream text-crimson shadow-sm' : 'bg-cream/15 text-cream hover:bg-cream/25'
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

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {status === 'ready' && (
          <div className="mb-10">
            <DateStrip value={day} onChange={setDay} counts={dayCounts} />
          </div>
        )}

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
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-3xl font-bold text-cream">
                {day ? longDay(day) : category === ALL_CATEGORIES ? 'All upcoming events' : category}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                {showCinemaFilter && (
                  <select
                    aria-label="Cinema"
                    value={cinemaId}
                    onChange={(e) => setCinemaId(e.target.value)}
                    className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-wine-900 focus:outline-none focus:ring-2 focus:ring-gold"
                  >
                    <option value="all">All cinemas</option>
                    {cinemas.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                )}
                {category !== ALL_CATEGORIES && (
                  <div className="flex rounded-full bg-wine-950/60 p-1 ring-1 ring-gold/20" role="group" aria-label="Sort">
                    {(['time', 'title'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={sort === m}
                        onClick={() => setSort(m)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${sort === m ? 'bg-crimson text-cream' : 'text-cream-dim hover:text-cream'}`}
                      >
                        {m === 'time' ? 'Soonest' : 'A–Z'}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-gold">
                  {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
                </p>
              </div>
            </div>

            {visibleEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-cream px-6 py-16 text-center text-wine-900">
                <p className="font-display text-3xl font-bold">
                  {day ? 'Nothing on this date' : 'No events match your search'}
                </p>
                <p className="text-wine-900/75">
                  {day ? 'Dates with a gold dot have events. Pick one of them or show all dates.' : 'Try a different keyword or category.'}
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright"
                >
                  Show all events
                </button>
              </div>
            ) : category === ALL_CATEGORIES ? (
              <div className="space-y-12">
                {sections.map(([name, list]) => (
                  <div key={name}>
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-4xl font-bold text-gold">{name}</h3>
                      <button
                        type="button"
                        onClick={() => setCategory(name)}
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-cream-dim transition hover:text-cream"
                      >
                        all {list.length} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="-mx-4 flex snap-x gap-6 overflow-x-auto px-4 pb-6 pt-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                      {list.map((event) => (
                        <div key={event.id} className="flex w-72 shrink-0 snap-start sm:w-80 [&>a]:w-full">
                          <EventCard event={event} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
