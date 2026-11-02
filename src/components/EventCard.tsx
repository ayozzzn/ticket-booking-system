import { CalendarDays, MapPin } from 'lucide-react';
import EventImage from '@/components/EventImage';
import { formatEventDate, formatEventTime, formatPrice, ticketsRemaining } from '@/lib/format';
import type { EventRecord } from '@/types/ticketing';

interface EventCardProps {
  event: EventRecord;
}

export default function EventCard({ event }: EventCardProps) {
  const remaining = event.ticket_tiers.reduce((sum, tier) => sum + ticketsRemaining(tier), 0);
  const capacity = event.ticket_tiers.reduce((sum, tier) => sum + tier.capacity, 0);
  const startingPrice =
    event.ticket_tiers.length > 0 ? Math.min(...event.ticket_tiers.map((tier) => tier.price_cents)) : null;

  const availability =
    remaining === 0
      ? { label: 'Sold out', className: 'bg-rose-100 text-rose-800' }
      : remaining <= capacity * 0.15
        ? { label: 'Almost sold out', className: 'bg-amber-100 text-amber-900' }
        : { label: 'Tickets available', className: 'bg-emerald-100 text-emerald-800' };

  return (
    <a
      href={`#/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 transition hover:ring-brand-600/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <EventImage src={event.image_url} alt={event.title} className="group-hover:scale-[1.03]" />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">
          {event.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-brand-800">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
        </p>
        <h3 className="font-display text-xl font-bold leading-snug tracking-tight text-slate-900">{event.title}</h3>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {event.venue}, {event.city}
          </span>
        </p>

        <div className="relative -mx-5 mt-auto border-t border-dashed border-slate-300 px-5 pt-4">
          <span
            className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border border-slate-200 bg-paper"
            aria-hidden="true"
          />
          <span
            className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full border border-slate-200 bg-paper"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">From</p>
              <p className="font-display text-xl font-bold text-slate-900">
                {startingPrice !== null ? formatPrice(startingPrice) : 'TBA'}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${availability.className}`}>
              {availability.label}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
