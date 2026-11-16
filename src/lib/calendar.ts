import type { EventRecord } from '@/types/ticketing';

/** Kazakhstan has one time zone (UTC+5) since 2024. Every day on the calendar is an Almaty day. */
export const TZ = 'Asia/Almaty';

const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** "2026-11-28": the Almaty calendar day of a moment. */
export const dayKey = (d: Date | string): string => keyFmt.format(typeof d === 'string' ? new Date(d) : d);

/** "19:30" in Almaty time. */
export const timeLabel = (iso: string): string => timeFmt.format(new Date(iso));

export interface MonthRef {
  year: number;
  month: number; // 0-11
}

export const monthOf = (key: string): MonthRef => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 });
export const addMonths = (m: MonthRef, n: number): MonthRef => {
  const total = m.year * 12 + m.month + n;
  return { year: Math.floor(total / 12), month: total % 12 };
};
export const sameMonth = (a: MonthRef, b: MonthRef) => a.year === b.year && a.month === b.month;

const pad = (n: number) => String(n).padStart(2, '0');
export const makeKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Day keys for a month grid, Monday first. Empty slots are null. Length is a multiple of 7. */
export function buildMonth({ year, month }: MonthRef): (string | null)[] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(makeKey(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export const monthTitle = ({ year, month }: MonthRef, locale = 'en-GB') =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const longDay = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function groupByDay<T extends { starts_at: string }>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const k = dayKey(e.starts_at);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return map;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PALETTE = ['#9b1c2c', '#c2410c', '#0f766e', '#6d28d9', '#b45309', '#1d4ed8', '#be185d', '#4d7c0f'];
const KNOWN: Record<string, string> = { Concert: PALETTE[0], Music: PALETTE[0], Cinema: PALETTE[3], Sports: PALETTE[2], Theatre: PALETTE[1], Festival: PALETTE[6], Conference: PALETTE[5], Classical: PALETTE[4] };
/** A stable colour per category, so new categories added in the admin panel also get one. */
export function categoryColor(category: string): string {
  if (KNOWN[category]) return KNOWN[category];
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Value for <input type="datetime-local">, in Almaty time. */
export function toAlmatyInput(iso: string): string {
  return `${dayKey(iso)}T${timeLabel(iso)}`;
}
/** Reads a datetime-local value as Almaty time and returns an ISO string. */
export function fromAlmatyInput(value: string): string {
  return new Date(`${value}:00+05:00`).toISOString();
}

export const cheapest = (e: EventRecord): number | null =>
  e.ticket_tiers.length ? Math.min(...e.ticket_tiers.map((t) => t.price_cents)) : null;
