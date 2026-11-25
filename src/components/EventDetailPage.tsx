
import { AlertCircle, ArrowLeft, CalendarDays, Clock3, Crown, Loader2, MapPin, Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import CheckoutModal from '@/components/CheckoutModal';
import EventImage from '@/components/EventImage';
import ShowtimesSection from '@/components/ShowtimesSection';
import EventReviews from '@/components/reviews/EventReviews';
import TrailerPlayer from '@/components/TrailerPlayer';
import { centsToKzt, useExchangeRate } from '@/hooks/useExchangeRate';
import { fetchEvent } from '@/lib/bookingApi';
import { formatEventDate, formatEventTime, formatKzt, formatPrice, ticketsRemaining } from '@/lib/format';
import { formatDuration, hasSessions, isSession, upcomingSessions } from '@/lib/sessions';
import { getYouTubeId } from '@/lib/trailer';
import type { EventRecord, TicketTier } from '@/types/ticketing';

interface EventDetailPageProps {
  eventId: string;
}

export default function EventDetailPage({ eventId }: EventDetailPageProps) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [rating, setRating] = useState<{ avg: number | null; count: number } | null>(null);

  const onReviewSummary = useCallback(
    (avg: number | null, count: number) => setRating({ avg, count }),
    []
  );

  const rate = useExchangeRate();

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

  const movie = event ? hasSessions(event) : false;
  const upcoming = event ? upcomingSessions(event) : [];
  const cinemaCount = new Set(upcoming.map((s) => s.cinema_id)).size;
  const plainTiers = event ? event.ticket_tiers.filter((t) => !isSession(t)) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
     <a
        href="#/"
        className="inline-flex items-center gap-2 text-sm font-medium text-cream-dim transition hover:text-cream"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All events
      </a>

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-32 text-cream-dim" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading event...
        </div>
      )}

      {(status === 'error' || status === 'missing') && (
        <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 rounded-2xl bg-cream p-8 text-center text-wine-900">
          <AlertCircle className="h-8 w-8 text-crimson" aria-hidden="true" />
          <p className="font-display text-3xl font-bold">
            {status === 'missing' ? 'We could not find that event' : 'Something went wrong'}
          </p>
          <p className="text-wine-900/75">
            {status === 'missing'
              ? 'It may have been removed. Browse the other events instead.'
              : errorMessage}
          </p>
          {status === 'error' && (
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {status === 'ready' && event && (
        <>
          <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-wine-800 shadow-2xl shadow-black/50 ring-1 ring-gold/25">
              <EventImage src={event.image_url} alt={event.title} />
            </div>

            <div className="flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-fit rounded-full bg-cream px-3 py-1 text-xs font-semibold text-crimson">
                  {event.category}
                </span>

                {(() => {
                  const count = rating?.count ?? event.rating_count ?? 0;
                  const avg = rating
                    ? rating.avg
                    : event.rating_avg != null
                      ? Number(event.rating_avg)
                      : null;

                  return (
                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })
                      }
                      className="flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold text-cream transition hover:bg-cream/20"
                    >
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {count > 0 && avg !== null
                        ? `${avg.toFixed(1)} · ${count} ${count === 1 ? 'review' : 'reviews'}`
                        : 'Rate it'}
                    </button>
                  );
                })()}

                {event.age_rating && (
                  <span className="rounded-full bg-crimson px-3 py-1 text-xs font-bold text-cream">
                    {event.age_rating}
                  </span>
                )}

                {formatDuration(event.duration_minutes) && (
                  <span className="flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDuration(event.duration_minutes)}
                  </span>
                )}
              </div>

              <h1 className="mt-5 font-display text-5xl font-bold leading-[1.08] text-gold sm:text-6xl">
                {event.title}
              </h1>

              {movie ? (
                <div className="mt-6 space-y-3 text-cream">
                  <p className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-gold" aria-hidden="true" />
                    {upcoming.length > 0
                      ? `${upcoming.length} ${upcoming.length === 1 ? 'session' : 'sessions'} · next ${formatEventDate(upcoming[0].starts_at)}, ${formatEventTime(upcoming[0].starts_at)}`
                      : 'No upcoming sessions'}
                  </p>

                  <p className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-gold" aria-hidden="true" />
                    {cinemaCount} {cinemaCount === 1 ? 'cinema' : 'cinemas'} in {event.city}
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3 text-cream">
                  <p className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-gold" aria-hidden="true" />
                    {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <p className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-gold" aria-hidden="true" />
                      {event.venue}, {event.city}
                    </p>

                    <a
                      href={`https://2gis.kz/almaty/search/${encodeURIComponent(
                        event.venue_address || `${event.venue}, ${event.city}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#28A745] px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#218838]"
                    >
                      <span className="text-base font-black">2ГИС</span>
                      Открыть карту
                    </a>
                  </div>
                </div>
              )}

              <p className="mt-6 text-base leading-relaxed text-cream-dim">
                {event.description}
              </p>
            </div>
          </div>

          {getYouTubeId(event.trailer_url) && (
            <section className="mt-16" aria-labelledby="trailer-heading">
              <h2 id="trailer-heading" className="font-display text-4xl font-bold text-gold">
                Watch the trailer
              </h2>
              <div className="mt-6 max-w-3xl">
                <TrailerPlayer url={event.trailer_url} title={event.title} />
              </div>
            </section>
          )}

          {movie && (
            <section className="mt-16" aria-labelledby="sessions-heading">
              <h2 id="sessions-heading" className="font-display text-4xl font-bold text-gold">
                Sessions
              </h2>
              <p className="mt-2 text-cream-dim">
                Pick a day and a time. Adult, student and child tickets are chosen on the next step.
              </p>
              <ShowtimesSection event={event} onPick={setSelectedTier} />
            </section>
          )}

          {plainTiers.length > 0 && (
            <section className="mt-16" aria-labelledby="tickets-heading">
              <h2 id="tickets-heading" className="font-display text-4xl font-bold text-gold">
                {movie ? 'Other tickets' : 'Choose your tickets'}
              </h2>
              <p className="mt-2 text-cream-dim">
                Select a ticket type to continue to checkout.
              </p>

              <ul className="mt-8 grid gap-6">
                {plainTiers.map((tier) => {
                  const remaining = ticketsRemaining(tier);
                  const soldOut = remaining === 0;
                  const low = !soldOut && remaining <= 10;
                  const vip = /\b(vip|premium|business)\b/i.test(tier.name);

                  return (
                    <li
                      key={tier.id}
                      className={`overflow-hidden rounded-2xl bg-cream text-wine-900 shadow-xl shadow-black/40 ${
                        vip ? 'ring-2 ring-gold shadow-gold/20' : ''
                      }`}
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="font-display text-2xl font-bold text-crimson">
                            {tier.name}
                          </h3>

                          {vip && (
                            <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-gold to-amber-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-wine-900">
                              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                              VIP
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-wine-900/75">{tier.description}</p>

                        <p
                          className={`mt-2 text-sm font-semibold ${
                            soldOut
                              ? 'text-red-700'
                              : low
                                ? 'text-amber-800'
                                : 'text-emerald-800'
                          }`}
                        >
                          {soldOut ? 'Sold out' : low ? `Only ${remaining} left` : 'Available'}
                        </p>
                      </div>

                      <div className="relative flex items-center justify-between gap-6 border-t-2 border-dashed border-crimson/35 px-5 py-4 before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-wine-950 after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-wine-950 sm:px-6">
                        <p className="font-display text-3xl font-bold text-wine-900">
                          {tier.price_cents === 0
                            ? 'Free'
                            : rate
                              ? formatKzt(centsToKzt(tier.price_cents, rate))
                              : formatPrice(tier.price_cents)}
                        </p>

                        <button
                          type="button"
                          disabled={soldOut}
                          onClick={() => setSelectedTier(tier)}
                          className="rounded-full bg-crimson px-6 py-2.5 text-sm font-semibold text-cream shadow-sm transition hover:-translate-y-0.5 hover:bg-crimson-bright hover:shadow-md disabled:cursor-not-allowed disabled:bg-wine-900/15 disabled:text-wine-900/50 disabled:shadow-none disabled:hover:translate-y-0"
                        >
                          {soldOut
                            ? 'Unavailable'
                            : tier.seating === 'reserved'
                              ? 'Choose seats'
                              : 'Select'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <EventReviews
            eventId={event.id}
            eventTitle={event.title}
            onSummaryChange={onReviewSummary}
          />

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
