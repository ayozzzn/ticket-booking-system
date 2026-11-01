import { AlertCircle, ArrowLeft, CalendarDays, Loader2, MapPin } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import CheckoutModal from '@/components/CheckoutModal';
import EventImage from '@/components/EventImage';
import { fetchEvent } from '@/lib/bookingApi';
import { formatEventDate, formatEventTime, formatPrice, ticketsRemaining } from '@/lib/format';
import type { EventRecord, TicketTier } from '@/types/ticketing';

interface EventDetailPageProps {
  eventId: string;
}

export default function EventDetailPage({ eventId }: EventDetailPageProps) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchEvent(eventId);
      if (!result) {
        setStatus('missing');
        return;
      }
      setEvent(result);
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <a
        href="#/"
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All events
      </a>

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-32 text-stone-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading event...
        </div>
      )}

      {(status === 'error' || status === 'missing') && (
        <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          <AlertCircle className="h-8 w-8 text-rose-700" aria-hidden="true" />
          <p className="font-display text-2xl text-stone-900">
            {status === 'missing' ? 'We could not find that event' : 'Something went wrong'}
          </p>
          <p className="text-stone-600">
            {status === 'missing' ? 'It may have been removed. Browse the other events instead.' : errorMessage}
          </p>
          {status === 'error' && (
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {status === 'ready' && event && (
        <>
          <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-stone-200 shadow-lg shadow-stone-900/10">
              <EventImage src={event.image_url} alt={event.title} />
            </div>

            <div className="flex flex-col justify-center">
              <span className="w-fit rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-900">
                {event.category}
              </span>
              <h1 className="mt-5 font-display text-4xl leading-[1.15] text-stone-900 sm:text-5xl">{event.title}</h1>

              <div className="mt-6 space-y-3 text-stone-700">
                <p className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-teal-800" aria-hidden="true" />
                  {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
                </p>
                <p className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-teal-800" aria-hidden="true" />
                  {event.venue}, {event.city}
                </p>
              </div>

              <p className="mt-6 text-base leading-relaxed text-stone-600">{event.description}</p>
            </div>
          </div>

          <section className="mt-16" aria-labelledby="tickets-heading">
            <h2 id="tickets-heading" className="font-display text-3xl text-stone-900">
              Choose your tickets
            </h2>
            <p className="mt-2 text-stone-600">Select a ticket type to continue to checkout.</p>

            <ul className="mt-8 grid gap-4">
              {event.ticket_tiers.map((tier) => {
                const remaining = ticketsRemaining(tier);
                const soldOut = remaining === 0;
                const low = !soldOut && remaining <= 10;
                return (
                  <li
                    key={tier.id}
                    className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200 transition hover:ring-teal-700/40 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                  >
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-stone-900">{tier.name}</h3>
                      <p className="mt-1 text-sm text-stone-600">{tier.description}</p>
                      <p
                        className={`mt-2 text-sm font-medium ${
                          soldOut ? 'text-rose-700' : low ? 'text-amber-800' : 'text-emerald-800'
                        }`}
                      >
                        {soldOut ? 'Sold out' : low ? `Only ${remaining} left` : 'Available'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-6 sm:justify-end">
                      <p className="font-display text-2xl text-stone-900">{formatPrice(tier.price_cents)}</p>
                      <button
                        type="button"
                        disabled={soldOut}
                        onClick={() => setSelectedTier(tier)}
                        className="rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 disabled:shadow-none disabled:hover:translate-y-0"
                      >
                        {soldOut ? 'Unavailable' : 'Select'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {selectedTier && (
            <CheckoutModal
              event={event}
              tier={selectedTier}
              onClose={() => setSelectedTier(null)}
              onBooked={() => void load()}
            />
          )}
        </>
      )}
    </div>
  );
}
