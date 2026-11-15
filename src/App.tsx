import SiteHeader from '@/components/SiteHeader';
import EventCatalog from '@/components/EventCatalog';
import EventDetailPage from '@/components/EventDetailPage';
import BookingLookupPage from '@/components/BookingLookupPage';
import RegisterPage from '@/components/RegisterPage';
import LoginPage from '@/components/LoginPage';
import ProfilePage from '@/components/ProfilePage';
import VersionBadge from '@/components/VersionBadge';
import { useRoute } from '@/hooks/useRoute';
import AdminPanel from '@/components/admin/AdminPanel';

function App() {
  const route = useRoute();

  return (
    <div className="kesh-bg flex min-h-screen flex-col font-sans text-cream antialiased">
      <SiteHeader activeRoute={route.name} />

      <main className="flex-1">
        {route.name === 'home' && <EventCatalog />}
        {route.name === 'event' && <EventDetailPage key={route.id} eventId={route.id} />}
        {route.name === 'bookings' && <BookingLookupPage />}
        {route.name === 'admin' && (
          <div className="min-h-[70vh] bg-[#f8efe8] text-stone-900">
            <AdminPanel />
          </div>
        )}
        {route.name === 'register' && <RegisterPage />}
        {route.name === 'login' && <LoginPage />}
        {route.name === 'profile' && <ProfilePage />}
      </main>

      <footer className="border-t border-gold/20 bg-wine-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-cream-dim sm:flex-row sm:px-6 lg:px-8">
          <span className="font-display text-2xl font-semibold text-cream">Kesh</span>
          <span>Tickets are reserved instantly. Keep your booking code safe.</span>
          <VersionBadge />
        </div>
      </footer>
    </div>
  );
}

export default App;