import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'event'; id: string }
  | { name: 'bookings' }
  | { name: 'admin' };

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const eventMatch = /^\/events\/([0-9a-f-]{36})$/i.exec(path);
  if (eventMatch) return { name: 'event', id: eventMatch[1] };
  if (path === '/bookings') return { name: 'bookings' };
  if (path === '/admin') return { name: 'admin' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
