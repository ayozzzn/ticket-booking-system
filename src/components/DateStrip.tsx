import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { addMonths, dayKey, longDay, makeKey, monthOf, monthTitle, type MonthRef } from '@/lib/calendar';

/** This month and the next two: from today (mid-November) to the end of January. */
const MONTHS_AHEAD = 2;
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  /** Selected day ("2026-11-28") or null for all dates. */
  value: string | null;
  onChange: (day: string | null) => void;
  /** Number of events per day key. Days with events get a dot. */
  counts: Map<string, number>;
}

interface MonthGroup {
  ref: MonthRef;
  days: string[];
}

function buildGroups(today: string): MonthGroup[] {
  const first = monthOf(today);
  const groups: MonthGroup[] = [];
  for (let i = 0; i <= MONTHS_AHEAD; i++) {
    const ref = addMonths(first, i);
    const total = new Date(Date.UTC(ref.year, ref.month + 1, 0)).getUTCDate();
    const days: string[] = [];
    for (let d = 1; d <= total; d++) {
      const key = makeKey(ref.year, ref.month, d);
      if (key >= today) days.push(key);
    }
    groups.push({ ref, days });
  }
  return groups;
}

/** A row of dates you can scroll sideways: "All dates", then every day grouped by month. */
export default function DateStrip({ value, onChange, counts }: Props) {
  const today = dayKey(new Date());
  const groups = useMemo(() => buildGroups(today), [today]);
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 420, behavior: 'smooth' });

  return (
    <div className="flex items-end gap-3">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={`mb-1 flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
          value === null ? 'bg-crimson text-cream shadow-lg shadow-crimson/30' : 'text-cream ring-1 ring-gold/40 hover:ring-gold'
        }`}
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        All dates
      </button>

      <button
        type="button" aria-label="Earlier dates" onClick={() => scrollBy(-1)}
        className="mb-2 hidden h-10 w-10 shrink-0 place-items-center rounded-full text-cream ring-1 ring-gold/30 transition hover:bg-cream/10 sm:grid"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div
        ref={scroller}
        className="flex min-w-0 flex-1 gap-8 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group" aria-label="Choose a date"
      >
        {groups.map((group) => (
          <div key={`${group.ref.year}-${group.ref.month}`} className="shrink-0">
            <p className="sticky left-0 mb-2 w-fit font-display text-lg font-bold text-gold">
              {monthTitle(group.ref).split(' ')[0]}
            </p>
            <div className="flex gap-1">
              {group.days.map((key) => {
                const selected = key === value;
                const count = counts.get(key) ?? 0;
                const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
                const weekend = weekday === 0 || weekday === 6;
                return (
                  <button
                    key={key} type="button" aria-pressed={selected}
                    onClick={() => onChange(selected ? null : key)}
                    aria-label={`${longDay(key)}, ${count} ${count === 1 ? 'event' : 'events'}`}
                    className={`relative flex w-12 shrink-0 flex-col items-center rounded-2xl py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                      selected
                        ? 'bg-crimson text-cream shadow-lg shadow-crimson/40'
                        : count > 0
                          ? 'text-cream hover:bg-cream/10'
                          : 'text-cream/40 hover:bg-cream/5'
                    }`}
                  >
                    <span className={`text-xs ${weekend && !selected ? 'text-crimson-bright' : ''}`}>{SHORT_DAYS[weekday]}</span>
                    <span className="font-display text-xl font-bold">{Number(key.slice(8))}</span>
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${count > 0 ? (selected ? 'bg-cream' : 'bg-gold') : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button" aria-label="Later dates" onClick={() => scrollBy(1)}
        className="mb-2 hidden h-10 w-10 shrink-0 place-items-center rounded-full text-cream ring-1 ring-gold/30 transition hover:bg-cream/10 sm:grid"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
