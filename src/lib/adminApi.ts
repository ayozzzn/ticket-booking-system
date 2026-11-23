import { supabase } from '@/lib/supabase';

export interface AdminEvent {
  id: string; title: string; description: string; category: string;
  venue: string; city: string; starts_at: string; image_url: string | null;
  trailer_url?: string | null;
  age_rating?: string | null; duration_minutes?: number | null;
  ticket_tiers?: AdminTier[];
}
export interface AdminFare { id: string; name: string; price_kzt: number; note: string; sort_order: number }
export interface AdminTier {
  id: string; name: string; description?: string; price_cents: number; capacity: number; sold: number;
  seating?: string; seats_per_row?: number | null; cinema_id?: string | null; starts_at?: string | null; hall?: string | null;
  format?: string | null; language?: string | null; fares?: AdminFare[];
}
export interface AdminCinema { id: string; name: string; address: string; city: string; is_active: boolean }
export interface AdminBooking {
  id: string; booking_code: string; customer_name: string; customer_email: string;
  quantity: number; total_cents: number; status: string; created_at: string;
  events?: { title: string } | null;
}

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: role, error: roleError } = await supabase
    .from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (roleError || !role) {
    await supabase.auth.signOut();
    throw new Error('This account does not have administrator access.');
  }
  return data.user;
}

export async function getAdminSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (error || !data) return null;
  return user;
}

export async function adminSignOut() { await supabase.auth.signOut(); }

export async function loadAdminEvents(): Promise<AdminEvent[]> {
  const { data, error } = await supabase.from('events').select('*, ticket_tiers(id,name,description,price_cents,capacity,sold,seating,seats_per_row,cinema_id,starts_at,hall,format,language,fares:tier_fares(id,name,price_kzt,note,sort_order))').order('starts_at');
  if (error) throw error;
  return (data ?? []) as AdminEvent[];
}

export async function loadAdminBookings(): Promise<AdminBooking[]> {
  const { data, error } = await supabase.from('bookings').select('id,booking_code,customer_name,customer_email,quantity,total_cents,status,created_at,events(title)').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as AdminBooking[];
}

export async function saveEvent(input: Omit<AdminEvent, 'id' | 'ticket_tiers'>, id?: string): Promise<string> {
  if (id) {
    const { error } = await supabase.from('events').update(input).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('events').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function removeEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function loadCinemas(): Promise<AdminCinema[]> {
  const { data, error } = await supabase.from('cinemas').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as AdminCinema[];
}

export async function saveCinema(input: Omit<AdminCinema, 'id'>, id?: string) {
  const { error } = id
    ? await supabase.from('cinemas').update(input).eq('id', id)
    : await supabase.from('cinemas').insert(input);
  if (error) throw error;
}

export interface NewSession {
  eventId: string; cinemaId: string; startsAt: string; hall: string; format: string; language: string;
  /** Seat map rows x seats per row; null seatsPerRow = no seat map, use capacity. */
  rows: number | null; seatsPerRow: number | null; capacity: number | null;
  fares: { name: string; price_kzt: number; note: string }[];
}

export async function createSession(input: NewSession): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_session', {
    p_event_id: input.eventId, p_cinema_id: input.cinemaId, p_starts_at: input.startsAt,
    p_hall: input.hall, p_format: input.format, p_language: input.language,
    p_rows: input.rows, p_seats_per_row: input.seatsPerRow, p_capacity: input.capacity, p_fares: input.fares,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteSession(tierId: string) {
  const { error } = await supabase.rpc('admin_delete_session', { p_tier_id: tierId });
  if (error) throw error;
}

export async function saveTicketTier(input: { event_id: string; name: string; description: string; price_cents: number; capacity: number }) {
  const { error } = await supabase.from('ticket_tiers').insert(input);
  if (error) throw error;
}