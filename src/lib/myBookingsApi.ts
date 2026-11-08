import { supabase } from '@/lib/supabase';
import type { BookingReceipt } from '@/types/ticketing';

export async function fetchMyBookings(): Promise<BookingReceipt[]> {
  const { data, error } = await supabase.rpc('get_my_bookings');

  if (error) {
    console.error('Failed to load my bookings', error);
    throw new Error('We could not load your tickets. Please try again.');
  }

  return Array.isArray(data) ? (data as BookingReceipt[]) : [];
}