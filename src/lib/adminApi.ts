import { supabase } from '@/lib/supabase';

export interface AdminEvent {
  id: string; title: string; description: string; category: string;
  venue: string; city: string; starts_at: string; image_url: string | null;
  ticket_tiers?: { id: string; name: string; price_cents: number; capacity: number; sold: number }[];
}
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
  const { data, error } = await supabase.from('events').select('*, ticket_tiers(id,name,price_cents,capacity,sold)').order('starts_at');
  if (error) throw error;
  return (data ?? []) as AdminEvent[];
}

export async function loadAdminBookings(): Promise<AdminBooking[]> {
  const { data, error } = await supabase.from('bookings').select('id,booking_code,customer_name,customer_email,quantity,total_cents,status,created_at,events(title)').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as AdminBooking[];
}

export async function saveEvent(input: Omit<AdminEvent, 'id' | 'ticket_tiers'>, id?: string) {
  const query = id ? supabase.from('events').update(input).eq('id', id) : supabase.from('events').insert(input);
  const { error } = await query;
  if (error) throw error;
}

export async function removeEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function saveTicketTier(input: { event_id: string; name: string; description: string; price_cents: number; capacity: number }) {
  const { error } = await supabase.from('ticket_tiers').insert(input);
  if (error) throw error;
}
