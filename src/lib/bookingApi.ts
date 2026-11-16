import { apiRequest } from '@/lib/apiClient';
import type { BookingReceipt, EventRecord, Seat } from '@/types/ticketing';

const EVENT_SELECT = '*, ticket_tiers(*)';

function sortEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    ticket_tiers: [...event.ticket_tiers].sort((a, b) => a.price_cents - b.price_cents),
  };
}

export async function fetchEvents(): Promise<EventRecord[]> {
  const data = await apiRequest<EventRecord[]>('/api/events');
  return data.map(sortEvent);
}

export async function fetchEvent(eventId: string): Promise<EventRecord | null> {
  try {
    const data = await apiRequest<EventRecord>(`/api/events/${encodeURIComponent(eventId)}`);
    return sortEvent(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'Event not found') return null;
    throw error;
  }
}

interface CreateBookingInput {
  tierId: string;
  quantity: number;
  customerName: string;
  customerEmail: string;
}

export async function createBooking(input: CreateBookingInput): Promise<BookingReceipt> {
  const data = await apiRequest<unknown>('/api/bookings', {
    method: 'POST', body: JSON.stringify(input),
  });
  if (!isBookingReceipt(data)) throw new Error('Invalid booking confirmation from backend.');
  return data;
}

export async function fetchTierSeats(tierId: string): Promise<Seat[]> {
  const data = await apiRequest<unknown>(`/api/tiers/${encodeURIComponent(tierId)}/seats`);
  return Array.isArray(data) ? (data as Seat[]) : [];
}

interface CreateSeatBookingInput {
  tierId: string;
  seatIds: string[];
  customerName: string;
  customerEmail: string;
}

export async function createSeatBooking(input: CreateSeatBookingInput): Promise<BookingReceipt> {
  const data = await apiRequest<unknown>('/api/bookings/seats', {
    method: 'POST', body: JSON.stringify(input),
  });
  if (!isBookingReceipt(data)) throw new Error('Invalid booking confirmation from backend.');
  return data;
}

export async function fetchBooking(code: string, email: string): Promise<BookingReceipt | null> {
  let data: unknown;
  try {
    data = await apiRequest<unknown>('/api/bookings/lookup', {
      method: 'POST', body: JSON.stringify({ code, email }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Booking not found') return null;
    throw error;
  }
  if (!isBookingReceipt(data)) throw new Error('Invalid booking response from backend.');
  return data;
}

export async function cancelBooking(code: string, email: string): Promise<BookingReceipt> {
  const data = await apiRequest<unknown>('/api/bookings/cancel', {
    method: 'POST', body: JSON.stringify({ code, email }),
  });
  if (!isBookingReceipt(data)) throw new Error('Invalid cancellation response from backend.');
  return data;
}

function isBookingReceipt(value: unknown): value is BookingReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.booking_code === 'string' &&
    typeof v.event_title === 'string' &&
    typeof v.quantity === 'number' &&
    typeof v.total_cents === 'number' &&
    (v.status === 'confirmed' || v.status === 'cancelled') &&
    (v.cancelled_at === null || typeof v.cancelled_at === 'string')
  );
}