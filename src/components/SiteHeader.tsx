import { Ticket } from 'lucide-react';
import type { Route } from '@/hooks/useRoute';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

interface SiteHeaderProps {
  activeRoute: Route['name'];
}

type NavItem = { label: string; href: string; route: Route['name']; highlight?: boolean };

const BASE_ITEMS: NavItem[] = [
  { label: 'Events', href: '#/', route: 'home' },
  { label: 'Find my booking', href: '#/bookings', route: 'bookings' },
  { label: 'Admin', href: '#/admin', route: 'admin' },
];

const GUEST_ITEMS: NavItem[] = [
  { label: 'Log in', href: '#/login', route: 'login' },
  { label: 'Sign up', href: '#/register', route: 'register', highlight: true },
];

const USER_ITEMS: NavItem[] = [{ label: 'My profile', href: '#/profile', route: 'profile' }];

export default function SiteHeader({ activeRoute }: SiteHeaderProps) {
  const { session } = useSession();
  const items = [...BASE_ITEMS, ...(session ? USER_ITEMS : GUEST_ITEMS)];

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.hash = '#/';
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gold/20 bg-wine-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#/" className="group flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-crimson text-cream ring-1 ring-cream/25 transition group-hover:bg-crimson-bright">
            <Ticket className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-display text-3xl font-semibold tracking-wide text-cream">Kesh</span>
        </a>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          {items.map((item) => {
            const isActive = item.route === activeRoute;
            const style = isActive
              ? 'bg-cream font-semibold text-wine-900'
              : item.highlight
                ? 'bg-crimson font-semibold text-cream hover:bg-crimson-bright'
                : 'text-cream-dim hover:bg-cream/10 hover:text-cream';
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-full px-3 py-2 text-sm transition sm:px-4 ${style}`}
              >
                {item.label}
              </a>
            );
          })}

          {session && (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full px-3 py-2 text-sm text-cream-dim transition hover:bg-cream/10 hover:text-cream sm:px-4"
            >
              Log out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}