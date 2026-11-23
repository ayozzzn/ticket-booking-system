import { dayKey, timeLabel } from '@/lib/calendar';
import type { BookingReceipt, EventRecord, TicketTier } from '@/types/ticketing';

/** A ticket type that is one showing of a movie in a cinema. */
export type Session = TicketTier & { starts_at: string };

export const isSession = (tier: TicketTier): tier is Session => Boolean(tier.starts_at);

export const sessionsOf = (event: EventRecord): Session[] =>
  event.ticket_tiers.filter(isSession).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

export const hasSessions = (event: EventRecord) => event.ticket_tiers.some(isSession);

const CINEMA_CATEGORIES = /^(cinema|movie|film|кино)/i;
export const isMovie = (event: EventRecord) => hasSessions(event) || CINEMA_CATEGORIES.test(event.category);

/** Sessions that can still be bought (start in the future). */
export const upcomingSessions = (event: EventRecord, now = new Date()) =>
  sessionsOf(event).filter((s) => new Date(s.starts_at) > now);

/** Almaty days on which the event happens: every session day for movies, else its own date. */
export function eventDays(event: EventRecord, now = new Date()): string[] {
  if (!hasSessions(event)) return [dayKey(event.starts_at)];
  return Array.from(new Set(upcomingSessions(event, now).map((s) => dayKey(s.starts_at))));
}

/** Next moment the event can be visited: next session for movies, else its date. */
export function nextStart(event: EventRecord, now = new Date()): string {
  if (!hasSessions(event)) return event.starts_at;
  return upcomingSessions(event, now)[0]?.starts_at ?? event.starts_at;
}

/** Cheapest ticket of a session in tenge (fares), or null when it has one plain price. */
export function minFareKzt(tier: TicketTier): number | null {
  const fares = tier.fares ?? [];
  return fares.length ? Math.min(...fares.map((f) => f.price_kzt)) : null;
}

export const sortedFares = (tier: TicketTier) =>
  [...(tier.fares ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

export type DayPart = 'all' | 'morning' | 'day' | 'evening' | 'night';
export const DAY_PARTS: { id: DayPart; label: string; hint: string }[] = [
  { id: 'all', label: 'Any time', hint: '' },
  { id: 'morning', label: 'Morning', hint: 'before 12:00' },
  { id: 'day', label: 'Day', hint: '12:00–17:00' },
  { id: 'evening', label: 'Evening', hint: '17:00–21:00' },
  { id: 'night', label: 'Night', hint: 'after 21:00' },
];
export function dayPartOf(iso: string): Exclude<DayPart, 'all'> {
  const h = Number(timeLabel(iso).slice(0, 2));
  if (h < 12) return 'morning';
  if (h < 17) return 'day';
  if (h < 21) return 'evening';
  return 'night';
}

/** "2 × Adult, 1 × Child" */
export function describeFares(receipt: Pick<BookingReceipt, 'fares'>): string | null {
  const lines = receipt.fares ?? [];
  return lines.length ? lines.map((l) => `${l.quantity} × ${l.name}`).join(', ') : null;
}

/** "Hall 3 · IMAX" or the ticket type name for non-movie bookings. */
export function sessionLabel(receipt: Pick<BookingReceipt, 'hall' | 'format' | 'tier_name'>): string {
  const parts = [receipt.hall, receipt.format].filter(Boolean);
  return parts.length ? parts.join(' · ') : receipt.tier_name;
}

export const formatDuration = (minutes?: number | null) =>
  minutes ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : null;
