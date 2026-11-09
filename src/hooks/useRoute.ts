import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'event'; id: string }
  | { name: 'bookings' }
  | { name: 'admin' }
  | { name: 'register' }
  | { name: 'login' }
  | { name: 'profile' };

function parseHash(hash: string): Route {
  // Anything that is not "#/something" (e.g. Supabase's "#access_token=..." after
  // an email confirmation link) falls back to the home page.
  if (!hash.startsWith('#/')) return { name: 'home' };

  const path = hash.slice(2).split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);

  switch (parts[0]) {
    case 'events':
      return parts[1] ? { name: 'event', id: parts[1] } : { name: 'home' };
    case 'bookings':
      return { name: 'bookings' };
    case 'admin':
      return { name: 'admin' };
    case 'register':
      return { name: 'register' };
    case 'login':
      return { name: 'login' };
    case 'profile':
    case 'my-bookings': // old link, kept so nothing breaks
      return { name: 'profile' };
    default:
      return { name: 'home' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}