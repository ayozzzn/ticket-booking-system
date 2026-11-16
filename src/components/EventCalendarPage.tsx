import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import EventImage from '@/components/EventImage';
import { centsToKzt, useExchangeRate } from '@/hooks/useExchangeRate';
import { fetchEvents } from '@/lib/bookingApi';
import {
  type MonthRef, WEEKDAYS, addMonths, buildMonth, categoryColor, cheapest, dayKey, groupByDay, longDay, monthOf, monthTitle, sameMonth, timeLabel,
} from '@/lib/calendar';
import { formatKzt, formatPrice, ticketsRemaining } from '@/lib/format';
import type { EventRecord } from '@/types/ticketing';

/** The calendar covers this month and the next two (today is mid-November: Nov, Dec, Jan). */
const MONTHS_AHEAD = 2;

const dateFromHash = () => {
  const m = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(window.location.hash);
  return m ? m[1] : null;
};

export default function EventCalendarPage() {
  const today = dayKey(new Date());
  const firstMonth = monthOf(today);
  const lastMonth = addMonths(firstMonth, MONTHS_AHEAD);

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');
  const initial = dateFromHash() ?? today;
  const [selected, setSelected] = useState(initial);
  const [month, setMonth] = useState(monthOf(initial));
  const rate = useExchangeRate();

  useEffect(() => {
    fetchEvents()
      .then((e) => { setEvents(e); setStatus('ready'); })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Something went wrong.'); setStatus('error'); });
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(events.map((e) => e.category))).sort()], [events]);
  const filtered = useMemo(() => (category === 'All' ? events : events.filter((e) => e.category === category)), [events, category]);
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const cells = useMemo(() => buildMonth(month), [month]);
  const dayEvents = byDay.get(selected) ?? [];
  const inMonthCount = cells.reduce((n, k) => n + (k ? (byDay.get(k)?.length ?? 0) : 0), 0);

  const nextWithEvents = useMemo(
    () => [...byDay.keys()].filter((k) => k > selected && k >= today).sort()[0] ?? null,
    [byDay, selected, today],
  );

  function pick(key: string) {
    setSelected(key);
    window.history.replaceState(null, '', `#/calendar?date=${key}`);
  }
  function goMonth(m: MonthRef) {
    setMonth(m);
  }

  const kzt = (cents: number) => (rate ? formatKzt(centsToKzt(cents, rate)) : formatPrice(cents));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="animate-fade-up flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-gold">
        <CalendarDays className="h-4 w-4" aria-hidden="true" /> Events calendar
      </p>
      <h1 className="animate-fade-up mt-3 font-display text-5xl font-bold leading-[1.08] text-gold sm:text-6xl">
        Pick a date, see what&rsquo;s on
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-cream-dim">
        Concerts, cinema, theatre and matches for the next two months. Times are in Almaty time (UTC+5).
      </p>

      {status === 'loading' && (
        <p className="mt-12 flex items-center gap-3 text-cream-dim"><Loader2 className="h-5 w-5 animate-spin" /> Loading the calendar…</p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-12 flex items-center gap-3 rounded-2xl bg-red-950/60 p-4 text-red-100">
          <AlertCircle className="h-5 w-5 shrink-0" /> {error}
        </p>
      )}

      {status === 'ready' && (
        <>
          <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                  category === c ? 'bg-cream font-semibold text-wine-900' : 'bg-cream/10 text-cream-dim hover:bg-cream/20 hover:text-cream'
                }`}
              >
                {c !== 'All' && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-cream/50" style={{ background: categoryColor(c) }} />}
                {c}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* Month grid */}
            <section aria-label="Month" className="rounded-3xl bg-cream p-4 text-wine-900 shadow-xl shadow-black/40 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button" aria-label="Previous month" disabled={sameMonth(month, firstMonth)}
                  onClick={() => goMonth(addMonths(month, -1))}
                  className="grid h-10 w-10 place-items-center rounded-full border border-wine-900/15 transition hover:bg-wine-900/5 disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="text-center">
                  <h2 className="font-display text-2xl font-bold">{monthTitle(month)}</h2>
                  <p className="text-xs text-wine-900/60">{inMonthCount} {inMonthCount === 1 ? 'event' : 'events'}</p>
                </div>
                <button
                  type="button" aria-label="Next month" disabled={sameMonth(month, lastMonth)}
                  onClick={() => goMonth(addMonths(month, 1))}
                  className="grid h-10 w-10 place-items-center rounded-full border border-wine-900/15 transition hover:bg-wine-900/5 disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-wine-900/50">
                {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {cells.map((key, i) => {
                  if (!key) return <span key={`e${i}`} />;
                  const list = byDay.get(key) ?? [];
                  const isSel = key === selected;
                  const isToday = key === today;
                  const past = key < today;
                  const colors = Array.from(new Set(list.map((e) => categoryColor(e.category)))).slice(0, 3);
                  return (
                    <button
                      key={key} type="button" onClick={() => pick(key)} aria-pressed={isSel}
                      aria-label={`${longDay(key)}, ${list.length} ${list.length === 1 ? 'event' : 'events'}`}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                        isSel
                          ? 'bg-crimson font-bold text-cream shadow-lg shadow-crimson/40'
                          : list.length
                            ? 'bg-wine-900/5 font-semibold hover:bg-wine-900/10'
                            : 'text-wine-900/60 hover:bg-wine-900/5'
                      } ${past && !isSel ? 'opacity-45' : ''} ${isToday && !isSel ? 'ring-2 ring-crimson/60' : ''}`}
                    >
                      <span className="font-display text-base font-bold">{Number(key.slice(8))}</span>
                      <span className="mt-0.5 flex h-2 items-center gap-0.5">
                        {colors.map((c) => (
                          <span key={c} className="h-1.5 w-1.5 rounded-full ring-1 ring-cream/70" style={{ background: c }} />
                        ))}
                      </span>
                      {list.length > 1 && (
                        <span className={`absolute right-1 top-1 rounded-full px-1.5 text-[10px] font-bold leading-4 ${isSel ? 'bg-cream text-crimson' : 'bg-crimson text-cream'}`}>
                          {list.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button" onClick={() => { setMonth(monthOf(today)); pick(today); }}
                className="mt-4 text-sm font-semibold text-crimson hover:underline"
              >
                Jump to today
              </button>
            </section>

            {/* Selected day */}
            <section aria-live="polite" aria-label="Events on the selected day">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">{selected === today ? 'Today' : selected < today ? 'Past date' : 'Selected date'}</p>
              <h2 className="mt-1 font-display text-3xl font-bold text-cream">{longDay(selected)}</h2>

              {dayEvents.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-dashed border-gold/40 p-8 text-center">
                  <CalendarDays className="mx-auto h-9 w-9 text-gold" aria-hidden="true" />
                  <p className="mt-3 font-display text-xl font-bold text-cream">Nothing planned for this day</p>
                  <p className="mt-1 text-sm text-cream-dim">
                    {category !== 'All' ? `No ${category.toLowerCase()} events here. Try another category or date.` : 'Try another date.'}
                  </p>
                  {nextWithEvents && (
                    <button
                      type="button"
                      onClick={() => { setMonth(monthOf(nextWithEvents)); pick(nextWithEvents); }}
                      className="mt-4 rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright"
                    >
                      Next event: {longDay(nextWithEvents)}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="mt-5 space-y-4">
                  {dayEvents.map((e) => {
                    const from = cheapest(e);
                    const left = e.ticket_tiers.reduce((s, t) => s + ticketsRemaining(t), 0);
                    return (
                      <li key={e.id}>
                        <a
                          href={`#/events/${e.id}`}
                          className="group flex overflow-hidden rounded-2xl bg-cream text-wine-900 shadow-xl shadow-black/40 transition hover:-translate-y-0.5 hover:shadow-crimson/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        >
                          <div className="hidden w-28 shrink-0 sm:block"><EventImage src={e.image_url} alt="" /></div>
                          <div className="min-w-0 flex-1 p-4">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <span className="flex items-center gap-1 rounded-full bg-crimson px-2.5 py-1 text-cream"><Clock className="h-3 w-3" aria-hidden="true" />{timeLabel(e.starts_at)}</span>
                              <span className="flex items-center gap-1.5 text-wine-900/70">
                                <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(e.category) }} />{e.category}
                              </span>
                            </div>
                            <h3 className="mt-2 font-display text-xl font-bold leading-tight">{e.title}</h3>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-wine-900/70">
                              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{e.venue}, {e.city}</span>
                            </p>
                            <div className="mt-3 flex items-center justify-between border-t border-dashed border-crimson/30 pt-3 text-sm">
                              <span>{from !== null ? <>from <b className="font-display text-lg">{kzt(from)}</b></> : 'Price TBA'}</span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${left === 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {left === 0 ? 'Sold out' : 'Buy tickets'}
                              </span>
                            </div>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
