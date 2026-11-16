import { supabase } from '@/lib/supabase';

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
if (!apiBase) throw new Error('Missing VITE_API_BASE_URL. Set it in .env.local or Vercel settings.');

/** auth: false = anonymous, true = login required, 'optional' = send the login token when there is one. */
export async function apiRequest<T>(path: string, options: RequestInit = {}, auth: boolean | 'optional' = false): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (auth) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session?.access_token && !error) headers.set('Authorization', `Bearer ${session.access_token}`);
    else if (auth === true) throw new Error('Please sign in first.');
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
