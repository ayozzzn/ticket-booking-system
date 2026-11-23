import { Film, Plus, Trash2, X } from 'lucide-react';
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

const FORMATS = ['2D', '3D', 'IMAX', 'IMAX 3D', '4DX', 'Dolby Atmos'];
const LANGUAGES = ['RU', 'KZ', 'EN', 'EN (subtitles)'];
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

/** Sessions of a movie: which cinema, when, which hall, and the price of each ticket type. */
export default function AdminSessions({ events, cinemas, onSaved, onError }: Props) {
  const movies = useMemo(
    () => [...events].sort((a, b) => Number(MOVIE.test(b.category)) - Number(MOVIE.test(a.category)) || a.title.localeCompare(b.title)),
    [events],
  );
  const activeCinemas = cinemas.filter((c) => c.is_active);
  const cinemaName = (id?: string | null) => cinemas.find((c) => c.id === id)?.name ?? '—';

  const [eventId, setEventId] = useState(movies[0]?.id ?? '');
  // Events arrive after the tab opens: pick the first movie once they are there.
  useEffect(() => {
    if (!movies.some((m) => m.id === eventId) && movies[0]) setEventId(movies[0].id);
  }, [movies, eventId]);
  const [showPast, setShowPast] = useState(false);
  const [cinemaId, setCinemaId] = useState('');
  const [date, setDate] = useState(dayKey(new Date()));
  const [times, setTimes] = useState('19:00');
  const [repeat, setRepeat] = useState(1);
  const [hall, setHall] = useState('Hall 1');
  const [format, setFormat] = useState('2D');
  const [language, setLanguage] = useState('RU');
  const [seatMap, setSeatMap] = useState(true);
  const [rows, setRows] = useState(8);
  const [perRow, setPerRow] = useState(12);
  const [capacity, setCapacity] = useState(100);
  const [fares, setFares] = useState(DEFAULT_FARES);
  const [saving, setSaving] = useState(false);

  const movie = movies.find((m) => m.id === eventId);
  const now = new Date().toISOString();
  const sessions = useMemo(
    () =>
      (movie?.ticket_tiers ?? [])
        .filter((t): t is AdminTier & { starts_at: string } => Boolean(t.starts_at))
        .filter((t) => showPast || t.starts_at > now)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [movie, showPast, now],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, typeof sessions>();
    for (const s of sessions) map.set(dayKey(s.starts_at), [...(map.get(dayKey(s.starts_at)) ?? []), s]);
    return [...map.entries()];
  }, [sessions]);

  const timeList = times.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const badTime = timeList.find((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  const total = timeList.length * repeat;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!eventId || !cinemaId) return onError('Choose a movie and a cinema.');
    if (badTime || timeList.length === 0) return onError(`Write times like 11:00, 14:30, 19:00${badTime ? ` ("${badTime}" is not a time)` : ''}.`);
    const cleanFares = fares
      .filter((f) => f.name.trim())
      .map((f, i) => ({ name: f.name.trim(), price_kzt: Math.round(Number(f.price)), note: f.note.trim(), i }));
    if (cleanFares.length === 0 || cleanFares.some((f) => !Number.isFinite(f.price_kzt) || f.price_kzt < 0)) {
      return onError('Every ticket type needs a name and a price in tenge.');
    }
    setSaving(true);
    let created = 0;
    const problems: string[] = [];
    for (let d = 0; d < repeat; d++) {
      for (const t of timeList) {
        const day = addDays(date, d);
        try {
          await createSession({
            eventId, cinemaId, startsAt: fromAlmatyInput(`${day}T${t}`), hall, format, language,
            rows: seatMap ? rows : null, seatsPerRow: seatMap ? perRow : null, capacity: seatMap ? null : capacity,
            fares: cleanFares.map(({ name, price_kzt, note }) => ({ name, price_kzt, note })),
          });
          created++;
        } catch (err) {
          problems.push(`${day} ${t}: ${err instanceof Error ? err.message : 'failed'}`);
        }
      }
    }
    setSaving(false);
    if (problems.length) onError(`Created ${created} of ${total}. ${problems.slice(0, 3).join(' ')}`);
    if (created) await onSaved(`Created ${created} ${created === 1 ? 'session' : 'sessions'} at ${cinemaName(cinemaId)}.`);
  }

  async function remove(s: AdminTier & { starts_at: string }) {
    if (!window.confirm(`Delete the ${timeLabel(s.starts_at)} session at ${cinemaName(s.cinema_id)}?`)) return;
    try {
      await deleteSession(s.id);
      await onSaved('Session deleted.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete the session.');
    }
  }

  const input = 'mt-1 w-full rounded-lg border border-stone-300 p-2.5';
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-[240px] flex-1 text-sm">Movie
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={input}>
              {movies.map((m) => (
                <option key={m.id} value={m.id}>{m.title}{MOVIE.test(m.category) ? '' : ` (${m.category})`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-3 text-sm text-stone-600">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past sessions
          </label>
        </div>

        {sessions.length === 0 ? (
          <div className="py-12 text-center text-stone-500">
            <Film className="mx-auto mb-3" />
            No {showPast ? '' : 'upcoming '}sessions for this movie yet. Add the first one on the right.
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {byDay.map(([day, list]) => (
              <div key={day}>
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{longDay(day)}</p>
                <div className="mt-2 space-y-2">
                  {list.map((s) => (
                    <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 p-3 ${s.starts_at < now ? 'opacity-50' : ''}`}>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          <span className="mr-2 font-mono">{timeLabel(s.starts_at)}</span>
                          {cinemaName(s.cinema_id)}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {[s.hall, s.format, s.language, s.seating === 'reserved' ? 'seat map' : 'no seat map'].filter(Boolean).join(' · ')} · {s.sold}/{s.capacity} sold
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                          {[...(s.fares ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((f) => (
                            <span key={f.id} className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-900">{f.name} {formatKzt(f.price_kzt)}</span>
                          ))}
                        </p>
                      </div>
                      <button type="button" onClick={() => void remove(s)} aria-label="Delete session" className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="h-fit rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">Add sessions</h2>
        <p className="mb-4 text-xs text-stone-500">For “{movie?.title ?? '…'}”. Times are Almaty time.</p>
        <label className="block text-sm">Cinema
          <select required value={cinemaId} onChange={(e) => setCinemaId(e.target.value)} className={input}>
            <option value="">Choose cinema</option>
            {activeCinemas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">First day<input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
          <label className="text-sm">Repeat for days<input type="number" min={1} max={14} value={repeat} onChange={(e) => setRepeat(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} className={input} /></label>
        </div>
        <label className="mt-3 block text-sm">Times (comma separated)
          <input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="11:00, 14:30, 19:00" className={`${input} ${badTime ? 'border-red-400' : ''}`} />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="text-sm">Hall<input value={hall} maxLength={40} onChange={(e) => setHall(e.target.value)} className={input} /></label>
          <label className="text-sm">Format<select value={format} onChange={(e) => setFormat(e.target.value)} className={input}>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label className="text-sm">Language<select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select></label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={seatMap} onChange={(e) => setSeatMap(e.target.checked)} /> Customers choose seats (seat map)
        </label>
        {seatMap ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="text-sm">Rows<input type="number" min={1} max={30} value={rows} onChange={(e) => setRows(Number(e.target.value))} className={input} /></label>
            <label className="text-sm">Seats per row<input type="number" min={1} max={30} value={perRow} onChange={(e) => setPerRow(Number(e.target.value))} className={input} /></label>
          </div>
        ) : (
          <label className="mt-2 block text-sm">Tickets available<input type="number" min={1} max={600} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className={input} /></label>
        )}

        <p className="mt-4 text-sm font-medium">Ticket types (price in ₸)</p>
        <div className="mt-2 space-y-2">
          {fares.map((f, i) => (
            <div key={i} className="rounded-xl bg-stone-50 p-2.5">
              <div className="flex gap-2">
                <input aria-label="Ticket type name" value={f.name} onChange={(e) => setFares(fares.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-full rounded-lg border border-stone-300 p-2 text-sm" />
                <input aria-label={`${f.name} price in tenge`} type="number" min={0} value={f.price} onChange={(e) => setFares(fares.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="w-28 rounded-lg border border-stone-300 p-2 text-sm" />
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFares(fares.filter((_, j) => j !== i))} className="px-1 text-stone-400 hover:text-red-600"><X size={16} /></button>
              </div>
              <input aria-label={`${f.name} note`} placeholder="Note for customers (optional)" value={f.note} onChange={(e) => setFares(fares.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className="mt-1.5 w-full rounded-lg border border-stone-200 p-2 text-xs" />
            </div>
          ))}
          <button type="button" onClick={() => setFares([...fares, { name: 'Pensioner', price: '1500', note: 'Show your pension certificate' }])} className="flex items-center gap-1.5 text-sm font-semibold text-teal-800">
            <Plus size={15} /> Add ticket type
          </button>
        </div>
        <p className="mt-3 text-xs text-stone-500">The first type is the default one customers get for each seat.</p>

        <button disabled={saving || !movie} className="mt-4 w-full rounded-xl bg-teal-800 p-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
          {saving ? 'Creating…' : `Create ${total} ${total === 1 ? 'session' : 'sessions'}`}
        </button>
      </form>
    </div>
  );
}
