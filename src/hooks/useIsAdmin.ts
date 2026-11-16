import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

/**
 * true when the logged-in account is listed in admin_users.
 * This only decides what the menu shows. The real protection is in the database (RLS).
 */
export function useIsAdmin(): boolean {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => alive && setIsAdmin(!error && !!data));
    return () => {
      alive = false;
    };
  }, [userId]);

  return isAdmin;
}
