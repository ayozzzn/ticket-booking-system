import { Ticket } from 'lucide-react';
import type { Route } from '@/hooks/useRoute';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

interface SiteHeaderProps {
  activeRoute: Route['name'];
}

type NavItem = { label: string; href: string; route: Route['name'] };

const BASE_ITEMS: NavItem[] = [
  { label: 'Events', href: '#/', route: 'home' },
  { label: 'Find my booking', href: '#/bookings', route: 'bookings' },
  { label: 'Admin', href: '#/admin', route: 'admin' },
];

const GUEST_ITEMS: NavItem[] = [
  { label: 'Log in', href: '#/login', route: 'login' },
  { label: 'Sign up', href: '#/register', route: 'register' },
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
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-800 text-white transition group-hover:bg-teal-700">
            <Ticket className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-stone-900">Stagepass</span>
        </a>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          {items.map((item) => {
            const isActive = item.route === activeRoute;
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-full px-3 py-2 text-sm transition sm:px-4 ${
                  isActive
                    ? 'bg-stone-900 font-medium text-white'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                {item.label}
              </a>
            );
          })}

          {session && (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-200/70 hover:text-stone-900 sm:px-4"
            >
              Log out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}