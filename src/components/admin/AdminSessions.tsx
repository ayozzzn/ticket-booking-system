import { CheckCircle2, Copy, Film, Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createSession, deleteSession, type AdminCinema, type AdminEvent, type AdminTier } from '@/lib/adminApi';
import { dayKey, fromAlmatyInput, longDay, timeLabel } from '@/lib/calendar';
import { formatKzt } from '@/lib/format';

interface Props {
  events: AdminEvent[];
  cinemas: AdminCinema[];
  onSaved: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
}

type SessionTier = AdminTier & { starts_at: string };

const FORMATS = ['2D', '3D', 'IMAX', 'IMAX 3D', '4DX', 'Dolby Atmos'];
const LANGUAGES = ['RU', 'KZ', 'EN', 'EN (subtitles)'];
const HALLS = ['Hall 1', 'Hall 2', 'Hall 3', 'Hall 4', 'Hall 5', 'Hall 6', 'IMAX', 'VIP'];
const COMMON_TIMES = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30', '22:00', '23:30'];
const HALL_SIZES = [
  { label: 'Small', rows: 6, perRow: 10 },
  { label: 'Medium', rows: 8, perRow: 12 },
  { label: 'Large', rows: 12, perRow: 16 },
  { label: 'Big', rows: 15, perRow: 20 },
];
const DEFAULT_FARES = [
  { name: 'Adult', price: '2500', note: '' },
  { name: 'Student', price: '1900', note: 'Show your student ID at the entrance' },
  { name: 'Child', price: '1700', note: 'Children aged 3 to 12' },
];
const MOVIE = /^(cinema|movie|film|кино)/i;

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortDay = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const sortTimes = (list: string[]) => [...new Set(list)].sort();

/** Number field with − / + buttons. Typing is allowed; the value is checked when the field loses focus. */
function Stepper({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const btn = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40';
  return (
    <div className="text-sm">
      <span>{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" aria-label={`${label}: less`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} className={btn}><Minus size={15} /></button>
        <input
          aria-label={label}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, '').slice(0, 4);
            setText(t);
            const n = Number(t);
            if (t !== '' && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => {
            const n = Number(text);
            const next = text === '' || !Number.isFinite(n) ? value : clamp(n);
            onChange(next);
            setText(String(next));
          }}
          className="h-9 w-full min-w-0 rounded-lg border border-stone-300 text-center font-semibold tabular-nums"
        />
        <button type="button" aria-label={`${label}: more`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} className={btn}><Plus size={15} /></button>
      </div>
    </div>
  );
}

/** Chips to pick one value from a short list. */
function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${value === o ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Sessions of a movie: which cinema, when, which hall, and the price of each ticket type. */
export default function AdminSessions({ events, cinemas, onSaved, onError }: Props) {
  const movies = useMemo(
    () => [...events].sort((a, b) => Number(MOVIE.test(b.category)) - Number(MOVIE.test(a.category)) || a.title.localeCompare(b.title)),
    [events],
  );
  const activeCinemas = cinemas.filter((c) => c.is_active);
  const cinemaName = (id?: string | null) => cinemas.find((c) => c.id === id)?.name ?? '—';
  const today = dayKey(new Date());

  const [eventId, setEventId] = useState(movies[0]?.id ?? '');
  // Events arrive after the tab opens: pick the first movie once they are there.
  useEffect(() => {
    if (!movies.some((m) => m.id === eventId) && movies[0]) setEventId(movies[0].id);
  }, [movies, eventId]);

  // --- form ---
  const [cinemaId, setCinemaId] = useState('');
  const [date, setDate] = useState(today);
  const [repeat, setRepeat] = useState(1);
  const [times, setTimes] = useState<string[]>(['19:00']);
  const [customTime, setCustomTime] = useState('');
  const [hall, setHall] = useState('Hall 1');
  const [format, setFormat] = useState('2D');
  const [language, setLanguage] = useState('RU');
  const [seatMap, setSeatMap] = useState(true);
  const [rows, setRows] = useState(8);
  const [perRow, setPerRow] = useState(12);
  const [capacity, setCapacity] = useState(100);
  const [fares, setFares] = useState(DEFAULT_FARES);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: string; problems: string[] } | null>(null);

  // --- list ---
  const [showPast, setShowPast] = useState(false);
  const [listDay, setListDay] = useState<string>('');
  const [listCinema, setListCinema] = useState('all');

  const movie = movies.find((m) => m.id === eventId);
  const now = new Date().toISOString();
  const sessions = useMemo(
    () =>
      (movie?.ticket_tiers ?? [])
        .filter((t): t is SessionTier => Boolean(t.starts_at))
        .filter((t) => showPast || t.starts_at > now)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [movie, showPast, now],
  );
  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) map.set(dayKey(s.starts_at), (map.get(dayKey(s.starts_at)) ?? 0) + 1);
    return [...map.entries()];
  }, [sessions]);
  const activeDay = dayCounts.some(([d]) => d === listDay) ? listDay : dayCounts[0]?.[0] ?? '';
  const visible = sessions.filter(
    (s) => dayKey(s.starts_at) === activeDay && (listCinema === 'all' || s.cinema_id === listCinema),
  );
  const listCinemas = [...new Set(sessions.map((s) => s.cinema_id).filter(Boolean))] as string[];

  const total = times.length * repeat;
  const lastDay = addDays(date, repeat - 1);
  const seats = seatMap ? rows * perRow : capacity;
  const tooManySeats = seats > 600;

  function toggleTime(t: string) {
    setTimes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : sortTimes([...prev, t])));
  }

  /** Fill the form from an existing session, so the next one is a click away. */
  function applyTemplate(s: SessionTier) {
    setCinemaId(s.cinema_id ?? '');
    setHall(s.hall ?? '');
    setFormat(s.format ?? '2D');
    setLanguage(s.language ?? 'RU');
    setSeatMap(s.seating === 'reserved');
    if (s.seating === 'reserved' && s.seats_per_row) {
      setPerRow(s.seats_per_row);
      setRows(Math.max(1, Math.round(s.capacity / s.seats_per_row)));
    } else {
      setCapacity(s.capacity);
    }
    setTimes([timeLabel(s.starts_at)]);
    setDate(addDays(dayKey(s.starts_at), 1) < today ? today : addDays(dayKey(s.starts_at), 1));
    const list = [...(s.fares ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    if (list.length) setFares(list.map((f) => ({ name: f.name, price: String(f.price_kzt), note: f.note })));
    setResult(null);
    document.getElementById('add-sessions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!eventId) return onError('Choose a movie first.');
    if (!cinemaId) return setResult({ ok: '', problems: ['Choose a cinema.'] });
    if (times.length === 0) return setResult({ ok: '', problems: ['Choose at least one time.'] });
    if (tooManySeats) return setResult({ ok: '', problems: ['A session can have at most 600 seats.'] });
    const named = fares.filter((f) => f.name.trim());
    // An empty price must not silently become a free ticket.
    const cleanFares = named.map((f) => ({ name: f.name.trim(), price_kzt: Math.round(Number(f.price)), note: f.note.trim() }));
    if (named.length === 0 || named.some((f) => f.price.trim() === '') || cleanFares.some((f) => !Number.isFinite(f.price_kzt) || f.price_kzt < 0)) {
      return setResult({ ok: '', problems: ['Every ticket type needs a name and a price in tenge.'] });
    }
    let created = 0;
    const problems: string[] = [];
    setProgress({ done: 0, total });
    for (let d = 0; d < repeat; d++) {
      for (const t of times) {
        const day = addDays(date, d);
        try {
          await createSession({
            eventId, cinemaId, startsAt: fromAlmatyInput(`${day}T${t}`), hall, format, language,
            rows: seatMap ? rows : null, seatsPerRow: seatMap ? perRow : null, capacity: seatMap ? null : capacity,
            fares: cleanFares,
          });
          created++;
        } catch (err) {
          problems.push(`${shortDay(day)} ${t}: ${err instanceof Error ? err.message : 'failed'}`);
        }
        setProgress({ done: created + problems.length, total });
      }
    }
    setProgress(null);
    const ok = created ? `Created ${created} ${created === 1 ? 'session' : 'sessions'} at ${cinemaName(cinemaId)}.` : '';
    setResult({ ok, problems });
    if (created) {
      setListDay(date);
      await onSaved(ok);
    }
  }

  async function remove(s: SessionTier) {
    if (!window.confirm(`Delete the ${timeLabel(s.starts_at)} session at ${cinemaName(s.cinema_id)}?`)) return;
    try {
      await deleteSession(s.id);
      await onSaved('Session deleted.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete the session.');
    }
  }

  const input = 'mt-1 w-full rounded-lg border border-stone-300 p-2.5';
  const section = 'border-t border-stone-100 pt-4';
  return (
    <div className="space-y-5">
      {/* Movie */}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-stone-200 bg-white p-5">
        <label className="min-w-[260px] flex-1 text-sm font-medium">Movie
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); setResult(null); }} className={input}>
            {movies.map((m) => (
              <option key={m.id} value={m.id}>{m.title}{MOVIE.test(m.category) ? '' : ` (${m.category})`}</option>
            ))}
          </select>
        </label>
        <p className="pb-3 text-sm text-stone-500">
          {sessions.length} {showPast ? '' : 'upcoming '}sessions in {listCinemas.length} {listCinemas.length === 1 ? 'cinema' : 'cinemas'}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Add form: first on small screens, a sticky column on wide ones */}
        <form id="add-sessions" onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div>
            <h2 className="font-semibold">Add sessions</h2>
            <p className="text-xs text-stone-500">For “{movie?.title ?? '…'}”. Times are Almaty time.</p>
          </div>

          <label className="block text-sm">Cinema
            <select value={cinemaId} onChange={(e) => setCinemaId(e.target.value)} className={`${input} ${result?.problems[0] === 'Choose a cinema.' ? 'border-red-400' : ''}`}>
              <option value="">Choose cinema</option>
              {activeCinemas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <div className={section}>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">First day<input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value || today)} className={input} /></label>
              <Stepper label="Days in a row" value={repeat} onChange={setRepeat} min={1} max={30} />
            </div>
            <p className="mt-1.5 text-xs text-stone-500">{repeat === 1 ? longDay(date) : `${shortDay(date)} – ${shortDay(lastDay)}`}</p>

            <p className="mt-3 text-sm">Times</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sortTimes([...COMMON_TIMES, ...times]).map((t) => (
                <button key={t} type="button" aria-pressed={times.includes(t)} onClick={() => toggleTime(t)}
                  className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold transition ${times.includes(t) ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input type="time" aria-label="Other time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="rounded-lg border border-stone-300 p-2 text-sm" />
              <button type="button" disabled={!customTime} onClick={() => { toggleTime(customTime); setCustomTime(''); }} className="rounded-lg border border-stone-300 px-3 text-sm font-semibold hover:bg-stone-50 disabled:opacity-40">
                Add time
              </button>
            </div>
          </div>

          <div className={section}>
            <span className="text-sm">Hall</span>
            <Chips options={HALLS} value={hall} onChange={setHall} />
            <input aria-label="Hall name" value={hall} maxLength={40} onChange={(e) => setHall(e.target.value)} placeholder="or type a name" className="mt-2 w-full rounded-lg border border-stone-300 p-2 text-sm" />
            <p className="mt-3 text-sm">Format</p>
            <Chips options={FORMATS} value={format} onChange={setFormat} />
            <p className="mt-3 text-sm">Language</p>
            <Chips options={LANGUAGES} value={language} onChange={setLanguage} />
          </div>

          <div className={section}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={seatMap} onChange={(e) => setSeatMap(e.target.checked)} /> Customers choose seats (seat map)
            </label>
            {seatMap ? (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {HALL_SIZES.map((h) => {
                    const on = rows === h.rows && perRow === h.perRow;
                    return (
                      <button key={h.label} type="button" aria-pressed={on} onClick={() => { setRows(h.rows); setPerRow(h.perRow); }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                        {h.label} · {h.rows}×{h.perRow}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stepper label="Rows" value={rows} onChange={setRows} min={1} max={30} />
                  <Stepper label="Seats per row" value={perRow} onChange={setPerRow} min={1} max={30} />
                </div>
              </>
            ) : (
              <div className="mt-2"><Stepper label="Tickets available" value={capacity} onChange={setCapacity} min={1} max={600} step={10} /></div>
            )}
            <p className={`mt-2 text-xs ${tooManySeats ? 'font-semibold text-red-600' : 'text-stone-500'}`}>
              {seats} seats{tooManySeats ? ' — the limit is 600 per session' : ''}
            </p>
          </div>

          <div className={section}>
            <p className="text-sm font-medium">Ticket types</p>
            <div className="mt-2 space-y-2">
              {fares.map((f, i) => (
                <div key={i} className="rounded-xl bg-stone-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <input aria-label="Ticket type name" value={f.name} onChange={(e) => setFares(fares.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-full min-w-0 rounded-lg border border-stone-300 p-2 text-sm" />
                    <div className="relative w-28 shrink-0">
                      <input aria-label={`${f.name} price in tenge`} inputMode="numeric" value={f.price} onChange={(e) => setFares(fares.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/\D/g, '') } : x)))} className="w-full rounded-lg border border-stone-300 p-2 pr-7 text-right text-sm tabular-nums" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">₸</span>
                    </div>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFares(fares.filter((_, j) => j !== i))} className="px-1 text-stone-400 hover:text-red-600"><X size={16} /></button>
                  </div>
                  <input aria-label={`${f.name} note`} placeholder="Note for customers (optional)" value={f.note} onChange={(e) => setFares(fares.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className="mt-1.5 w-full rounded-lg border border-stone-200 p-2 text-xs" />
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <button type="button" onClick={() => setFares([...fares, { name: 'Pensioner', price: '1500', note: 'Show your pension certificate' }])} className="flex items-center gap-1.5 text-sm font-semibold text-teal-800">
                <Plus size={15} /> Add ticket type
              </button>
              <button type="button" onClick={() => setFares(DEFAULT_FARES)} className="text-sm text-stone-500 hover:text-stone-800">Reset prices</button>
            </div>
            <p className="mt-2 text-xs text-stone-500">The first type is the default one customers get for each seat.</p>
          </div>

          <div className="sticky bottom-0 -mx-5 -mb-5 rounded-b-2xl border-t border-stone-100 bg-white/95 p-5 backdrop-blur">
            <p className="mb-2 text-xs text-stone-600">
              {times.length} {times.length === 1 ? 'time' : 'times'} × {repeat} {repeat === 1 ? 'day' : 'days'}
              {cinemaId ? ` at ${cinemaName(cinemaId)}` : ''}
            </p>
            <button disabled={!!progress || !movie || total === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 p-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
              {progress && <Loader2 size={16} className="animate-spin" />}
              {progress ? `Creating ${progress.done} of ${progress.total}…` : `Create ${total} ${total === 1 ? 'session' : 'sessions'}`}
            </button>
            {result && (result.ok || result.problems.length > 0) && (
              <div className="mt-3 space-y-1 text-sm" role="status">
                {result.ok && <p className="flex items-center gap-2 text-teal-800"><CheckCircle2 size={16} /> {result.ok}</p>}
                {result.problems.slice(0, 4).map((p) => <p key={p} className="text-red-600">{p}</p>)}
                {result.problems.length > 4 && <p className="text-red-600">…and {result.problems.length - 4} more</p>}
              </div>
            )}
          </div>
        </form>

        {/* Sessions, one day at a time */}
        <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Sessions</h2>
            <div className="flex flex-wrap items-center gap-3">
              {listCinemas.length > 1 && (
                <select aria-label="Filter by cinema" value={listCinema} onChange={(e) => setListCinema(e.target.value)} className="rounded-lg border border-stone-300 p-2 text-sm">
                  <option value="all">All cinemas</option>
                  {listCinemas.map((id) => <option key={id} value={id}>{cinemaName(id)}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Past
              </label>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 text-center text-stone-500">
              <Film className="mx-auto mb-3" />
              No {showPast ? '' : 'upcoming '}sessions for this movie yet. Add them with the form.
            </div>
          ) : (
            <>
              <div className="-mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Day">
                {dayCounts.map(([d, n]) => (
                  <button key={d} type="button" aria-pressed={d === activeDay} onClick={() => setListDay(d)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-semibold ${d === activeDay ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                    {d === today ? 'Today' : shortDay(d)}
                    <span className={`ml-1.5 ${d === activeDay ? 'text-teal-100' : 'text-stone-400'}`}>{n}</span>
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-500">{activeDay && longDay(activeDay)}</p>
              {visible.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No sessions in this cinema on this day.</p>}
              <div className="mt-2 space-y-2">
                {visible.map((s) => (
                  <div key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-stone-100 p-3 ${s.starts_at < now ? 'opacity-50' : ''}`}>
                    <span className="w-14 font-mono text-lg font-bold">{timeLabel(s.starts_at)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{cinemaName(s.cinema_id)}</p>
                      <p className="text-xs text-stone-500">
                        {[s.hall, s.format, s.language, s.seating === 'reserved' ? 'seat map' : 'no seat map'].filter(Boolean).join(' · ')}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {[...(s.fares ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((f) => (
                          <span key={f.id} className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-900">{f.name} {formatKzt(f.price_kzt)}</span>
                        ))}
                      </div>
                    </div>
                    <div className="w-24 text-right text-xs text-stone-500">
                      {s.sold}/{s.capacity} sold
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full bg-teal-700" style={{ width: `${Math.min(100, (s.sold / Math.max(1, s.capacity)) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => applyTemplate(s)} title="Copy into the form" aria-label="Use as template" className="rounded-lg border border-stone-300 p-2 text-stone-600 hover:bg-stone-50"><Copy size={16} /></button>
                      <button type="button" onClick={() => void remove(s)} title="Delete" aria-label="Delete session" className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
