import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminEvent } from '@/lib/adminApi';
import { WEEKDAYS, addMonths, buildMonth, categoryColor, dayKey, groupByDay, longDay, monthOf, monthTitle, timeLabel } from '@/lib/calendar';

interface Props {
  events: AdminEvent[];
  onAdd: (dayKey: string) => void;
  onEdit: (event: AdminEvent) => void;
}

/** Month view for admins: click a day to add an event on that date, click an event to edit it. */
export default function AdminCalendar({ events, onAdd, onEdit }: Props) {
  const today = dayKey(new Date());
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const cells = useMemo(() => buildMonth(month), [month]);
  const list = byDay.get(selected) ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="rounded-lg border border-stone-300 p-2 hover:bg-stone-50"><ChevronLeft size={18} /></button>
          <h2 className="font-display text-xl font-bold">{monthTitle(month)}</h2>
          <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="rounded-lg border border-stone-300 p-2 hover:bg-stone-50"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-stone-500">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((key, i) => {
            if (!key) return <span key={`e${i}`} />;
            const evs = byDay.get(key) ?? [];
            const isSel = key === selected;
            return (
              <button
                key={key} type="button" onClick={() => setSelected(key)}
                className={`min-h-[72px] rounded-xl border p-1.5 text-left text-xs transition ${isSel ? 'border-teal-800 bg-teal-50' : 'border-stone-100 hover:bg-stone-50'} ${key === today ? 'ring-1 ring-teal-700' : ''}`}
              >
                <span className="font-semibold">{Number(key.slice(8))}</span>
                {evs.slice(0, 2).map((e) => (
                  <span key={e.id} className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-stone-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: categoryColor(e.category) }} />{e.title}
                  </span>
                ))}
                {evs.length > 2 && <span className="text-[11px] text-stone-400">+{evs.length - 2} more</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Selected day</p>
        <h2 className="mt-1 font-display text-2xl font-bold">{longDay(selected)}</h2>
        <button type="button" onClick={() => onAdd(selected)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus size={17} /> Add event on this date
        </button>
        <div className="mt-4 space-y-2">
          {list.length === 0 && <p className="py-4 text-center text-sm text-stone-500">No events on this day.</p>}
          {list.map((e) => (
            <button key={e.id} type="button" onClick={() => onEdit(e)} className="w-full rounded-xl border border-stone-100 p-3 text-left hover:bg-stone-50">
              <p className="flex items-center gap-2 text-xs text-stone-500"><span className="h-2 w-2 rounded-full" style={{ background: categoryColor(e.category) }} />{timeLabel(e.starts_at)} · {e.category}</p>
              <p className="mt-1 font-semibold">{e.title}</p>
              <p className="text-xs text-stone-500">{e.venue}, {e.city} · tap to edit</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
