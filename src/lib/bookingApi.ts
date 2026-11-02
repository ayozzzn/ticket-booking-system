import { supabase } from '@/lib/supabase';
import type { BookingReceipt, EventRecord } from '@/types/ticketing';

const EVENT_SELECT = '*, ticket_tiers(*)';

function sortEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    ticket_tiers: [...event.ticket_tiers].sort((a, b) => a.price_cents - b.price_cents),
  };
}

export async function fetchEvents(): Promise<EventRecord[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .order('starts_at', { ascending: true });

  if (error) {
    console.error('Failed to load events', error);
    throw new Error('We could not load events. Please try again.');
  }

  return (data ?? []).map((event) => sortEvent(event as EventRecord));
}

export async function fetchEvent(eventId: string): Promise<EventRecord | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load event', error);
    throw new Error('We could not load this event. Please try again.');
  }

  return data ? sortEvent(data as EventRecord) : null;
}

interface CreateBookingInput {
  tierId: string;
  quantity: number;
  customerName: string;
  customerEmail: string;
}

export async function createBooking(input: CreateBookingInput): Promise<BookingReceipt> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_tier_id: input.tierId,
    p_quantity: input.quantity,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
  });

  if (error) {
    console.error('Booking failed', error);
    throw new Error(error.message || 'Your booking could not be completed. Please try again.');
  }

  if (!isBookingReceipt(data)) {
    throw new Error('Your booking was received but the confirmation could not be loaded. Please look it up with your booking code.');
  }

  return data;
}

export async function fetchBooking(code: string, email: string): Promise<BookingReceipt | null> {
  const { data, error } = await supabase.rpc('get_booking', {
    p_code: code,
    p_email: email,
  });

  if (error) {
    console.error('Booking lookup failed', error);
    throw new Error('We could not look up your booking. Please try again.');
  }

  if (data === null) {
    return null;
  }

  if (!isBookingReceipt(data)) {
    throw new Error('We could not read your booking details. Please try again.');
  }

  return data;
}

function isBookingReceipt(value: unknown): value is BookingReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.booking_code === 'string' &&
    typeof v.event_title === 'string' &&
    typeof v.quantity === 'number' &&
    typeof v.total_cents === 'number'
  );
}
