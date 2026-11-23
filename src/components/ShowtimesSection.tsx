import { Clock3, Film, MapPin, Ticket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { centsToKzt, useExchangeRate } from '@/hooks/useExchangeRate';
import { dayKey, timeLabel } from '@/lib/calendar';
import { formatKzt, ticketsRemaining } from '@/lib/format';
import { DAY_PARTS, dayPartOf, minFareKzt, upcomingSessions, type DayPart, type Session } from '@/lib/sessions';
import type { EventRecord } from '@/types/ticketing';

interface Props {
  event: EventRecord;
  onPick: (session: Session) => void;
}

type SortMode = 'cinema' | 'time';

const shortDay = (key: string, today: string, tomorrow: string) => {
  if (key === today) return { top: 'Today', bottom: '' };
  if (key === tomorrow) return { top: 'Tomorrow', bottom: '' };
  const d = new Date(`${key}T12:00:00Z`);
  return {
    top: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    bottom: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  };
};

/** kino.kz-style showtimes: pick a day, filter by cinema / time of day / format, sort by cinema or by time. */
export default function ShowtimesSection({ event, onPick }: Props) {
  const rate = useExchangeRate();
  const sessions = useMemo(() => upcomingSessions(event), [event]);
  const days = useMemo(() => Array.from(new Set(sessions.map((s) => dayKey(s.starts_at)))), [sessions]);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));

  const [day, setDay] = useState<string>(() => days[0] ?? today);
  const [cinemaId, setCinemaId] = useState('all');
  const [part, setPart] = useState<DayPart>('all');
  const [format, setFormat] = useState('all');
  const [sort, setSort] = useState<SortMode>('cinema');

  const activeDay = days.includes(day) ? day : days[0];
  const ofDay = useMemo(() => sessions.filter((s) => dayKey(s.starts_at) === activeDay), [sessions, activeDay]);

  const cinemas = useMemo(() => {
    const map = new Map<string, { id: string; name: string; address: string }>();
    for (const s of sessions) if (s.cinema) map.set(s.cinema.id, s.cinema);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);
  const formats = useMemo(() => Array.from(new Set(sessions.map((s) => s.format || '2D'))).sort(), [sessions]);

  const visible = useMemo(
    () =>
      ofDay.filter(
        (s) =>
          (cinemaId === 'all' || s.cinema_id === cinemaId) &&
          (part === 'all' || dayPartOf(s.starts_at) === part) &&
          (format === 'all' || (s.format || '2D') === format),
      ),
    [ofDay, cinemaId, part, format],
  );

  const byCinema = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of visible) map.set(s.cinema_id ?? 'other', [...(map.get(s.cinema_id ?? 'other') ?? []), s]);
    // Cinema with the earliest session first, like kino.kz.
    return [...map.entries()].sort((a, b) => a[1][0].starts_at.localeCompare(b[1][0].starts_at));
  }, [visible]);

  const priceFrom = (s: Session) => {
    const kzt = minFareKzt(s) ?? (rate ? centsToKzt(s.price_cents, rate) : null);
    return kzt === null ? '' : kzt === 0 ? 'Free' : `from ${formatKzt(kzt)}`;
  };

  if (sessions.length === 0) {
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-gold/40 p-10 text-center">
        <Film className="mx-auto h-9 w-9 text-gold" aria-hidden="true" />
        <p className="mt-3 font-display text-2xl font-bold text-cream">No upcoming sessions</p>
        <p className="mt-1 text-cream-dim">New sessions appear here as soon as cinemas add them.</p>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? 'bg-cream text-wine-900' : 'bg-cream/10 text-cream-dim hover:bg-cream/20 hover:text-cream'
    }`;

  return (
    <div className="mt-8">
      {/* Days */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none]" role="group" aria-label="Choose a day">
        {days.map((key) => {
          const label = shortDay(key, today, tomorrow);
          const active = key === activeDay;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setDay(key)}
              className={`flex min-w-[76px] shrink-0 flex-col items-center rounded-2xl px-3 py-2.5 transition ${
                active ? 'bg-crimson text-cream shadow-lg shadow-crimson/40' : 'bg-cream/10 text-cream hover:bg-cream/20'
              }`}
            >
              <span className="text-sm font-bold">{label.top}</span>
              {label.bottom && <span className="text-xs opacity-80">{label.bottom}</span>}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-cream/5 p-4 ring-1 ring-gold/15 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="cinema-filter">Cinema</label>
          <select
            id="cinema-filter"
            value={cinemaId}
            onChange={(e) => setCinemaId(e.target.value)}
            className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-wine-900 focus:outline-none focus:ring-2 focus:ring-gold"
          >
            <option value="all">All cinemas ({cinemas.length})</option>
            {cinemas.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {DAY_PARTS.map((p) => (
            <button key={p.id} type="button" aria-pressed={part === p.id} title={p.hint} onClick={() => setPart(p.id)} className={chip(part === p.id)}>
              {p.label}
            </button>
          ))}
          {formats.length > 1 &&
            ['all', ...formats].map((f) => (
              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={chip(format === f)}>
                {f === 'all' ? 'All formats' : f}
              </button>
            ))}
        </div>
        <div className="flex shrink-0 rounded-full bg-wine-950/60 p-1 ring-1 ring-gold/20" role="group" aria-label="Sort sessions">
          {(['cinema', 'time'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={sort === m}
              onClick={() => setSort(m)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${sort === m ? 'bg-crimson text-cream' : 'text-cream-dim hover:text-cream'}`}
            >
              {m === 'cinema' ? 'By cinema' : 'By time'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-gold/40 p-8 text-center">
          <p className="font-display text-xl font-bold text-cream">No sessions match these filters</p>
          <button
            type="button"
            onClick={() => { setCinemaId('all'); setPart('all'); setFormat('all'); }}
            className="mt-4 rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright"
          >
            Show all sessions
          </button>
        </div>
      ) : sort === 'cinema' ? (
        <ul className="mt-6 space-y-4">
          {byCinema.map(([id, list]) => {
            const cinema = list[0].cinema;
            return (
              <li key={id} className="rounded-2xl bg-cream p-5 text-wine-900 shadow-xl shadow-black/40 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl font-bold">{cinema?.name ?? 'Cinema'}</h3>
                  {cinema?.address && (
                    <p className="flex items-center gap-1.5 text-sm text-wine-900/65">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {cinema.address}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {list.map((s) => (
                    <SessionButton key={s.id} session={s} price={priceFrom(s)} onPick={onPick} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-6 divide-y divide-wine-900/10 overflow-hidden rounded-2xl bg-cream text-wine-900 shadow-xl shadow-black/40">
          {visible.map((s) => {
            const left = ticketsRemaining(s);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                <span className="w-16 font-display text-2xl font-bold tabular-nums">{timeLabel(s.starts_at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.cinema?.name}</p>
                  <p className="text-sm text-wine-900/65">{[s.hall, s.format || '2D', s.language].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="text-sm font-semibold text-wine-900/80">{priceFrom(s)}</span>
                <button
                  type="button"
                  disabled={left === 0}
                  onClick={() => onPick(s)}
                  className="flex items-center gap-2 rounded-full bg-crimson px-5 py-2 text-sm font-semibold text-cream transition hover:bg-crimson-bright disabled:cursor-not-allowed disabled:bg-wine-900/15 disabled:text-wine-900/50"
                >
                  <Ticket className="h-4 w-4" aria-hidden="true" />
                  {left === 0 ? 'Sold out' : 'Buy'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SessionButton({ session, price, onPick }: { session: Session; price: string; onPick: (s: Session) => void }) {
  const left = ticketsRemaining(session);
  const soldOut = left === 0;
  const low = !soldOut && left <= 10;
  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onPick(session)}
      className="group flex min-w-[118px] flex-col items-start rounded-xl bg-white px-4 py-3 text-left ring-1 ring-wine-900/15 transition hover:-translate-y-0.5 hover:bg-crimson hover:text-cream hover:ring-crimson hover:shadow-lg hover:shadow-crimson/30 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:text-wine-900"
    >
      <span className="flex items-center gap-1.5 font-display text-2xl font-bold tabular-nums">
        <Clock3 className="h-4 w-4 opacity-60" aria-hidden="true" />
        {timeLabel(session.starts_at)}
      </span>
      <span className="mt-0.5 text-xs font-semibold opacity-75">
        {[session.format || '2D', session.language, session.hall].filter(Boolean).join(' · ')}
      </span>
      <span className="mt-1 text-xs">{soldOut ? 'Sold out' : low ? `${left} seats left` : price}</span>
    </button>
  );
}
