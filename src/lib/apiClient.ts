import { supabase } from '@/lib/supabase';

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
if (!apiBase) throw new Error('Missing VITE_API_BASE_URL. Set it in .env.local or Vercel settings.');

export async function apiRequest<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (auth) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error('Please sign in first.');
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  let response: Response;
  try { response = await fetch(`${apiBase}${path}`, { ...options, headers }); }
  catch { throw new Error('Cannot reach the Kesh backend. Check the server URL and connection.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Backend request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
