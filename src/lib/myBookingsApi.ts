import { apiRequest } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import type { BookingReceipt } from '@/types/ticketing';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
}

export async function fetchMyBookings(): Promise<BookingReceipt[]> {
  const data = await apiRequest<unknown>('/api/bookings/my', {}, true);
  return Array.isArray(data) ? data as BookingReceipt[] : [];
}

/** Cancel one of the signed-in user's bookings (no email needed, the account is the proof). */
export async function cancelMyBooking(code: string): Promise<BookingReceipt> {
  const data = await apiRequest<unknown>('/api/bookings/my/cancel', {
    method: 'POST', body: JSON.stringify({ code }),
  }, true);
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new Error('Invalid cancellation response from backend.');
  return data as BookingReceipt;
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name')
    .maybeSingle();

  if (error) {
    console.error('Failed to load profile', error);
    throw new Error('We could not load your profile. Please try again.');
  }

  return (data as Profile | null) ?? null;
}

export async function updateProfileName(userId: string, fullName: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId);

  if (error) {
    console.error('Failed to update profile', error);
    throw new Error('We could not save your name. Please try again.');
  }
}