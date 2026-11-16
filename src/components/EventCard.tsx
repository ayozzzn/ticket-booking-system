import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
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
      ? { label: 'Sold out', className: 'bg-red-100 text-red-800' }
      : remaining <= capacity * 0.15
        ? { label: 'Almost sold out', className: 'bg-amber-100 text-amber-900' }
        : { label: 'Tickets available', className: 'bg-emerald-100 text-emerald-800' };

  return (
    <a
      href={`#/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-cream text-wine-900 shadow-xl shadow-black/40 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-crimson/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <EventImage src={event.image_url} alt={event.title} className="group-hover:scale-105" />
        <span className="absolute left-4 top-4 rounded-full bg-cream px-3 py-1 text-xs font-semibold text-crimson shadow-sm">
          {event.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-crimson">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
        </p>
        <h3 className="font-display text-3xl font-bold leading-[1.05] text-wine-900">{event.title}</h3>
        <p className="flex items-center gap-2 text-sm text-wine-900/70">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {event.venue}, {event.city}
          </span>
        </p>
      </div>

      {/* Ticket stub: dashed perforation with side notches */}
      <div className="relative mt-auto flex items-center justify-between gap-3 border-t-2 border-dashed border-crimson/35 px-5 py-4 before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-wine-950 after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-wine-950">
        <div>
          <p className="text-xs text-wine-900/60">From</p>
          <p className="font-display text-2xl font-bold text-wine-900">
            {startingPrice !== null ? formatPrice(startingPrice) : 'TBA'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${availability.className}`}>
            {availability.label}
          </span>
          <ArrowUpRight
            className="h-5 w-5 text-wine-900/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-crimson"
            aria-hidden="true"
          />
        </div>
      </div>
    </a>
  );
}
