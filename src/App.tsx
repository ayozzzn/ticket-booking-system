import SiteHeader from '@/components/SiteHeader';
import EventCatalog from '@/components/EventCatalog';
import EventDetailPage from '@/components/EventDetailPage';
import BookingLookupPage from '@/components/BookingLookupPage';
import RegisterPage from '@/components/RegisterPage';
import LoginPage from '@/components/LoginPage';
import MyBookingsPage from '@/components/MyBookingsPage';
import { useRoute } from '@/hooks/useRoute';
import AdminPanel from '@/components/admin/AdminPanel';

function App() {
  const route = useRoute();

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 font-sans text-stone-900 antialiased">
      <SiteHeader activeRoute={route.name} />

      <main className="flex-1">
        {route.name === 'home' && <EventCatalog />}
        {route.name === 'event' && <EventDetailPage key={route.id} eventId={route.id} />}
        {route.name === 'bookings' && <BookingLookupPage />}
        {route.name === 'admin' && <AdminPanel />}
        {route.name === 'register' && <RegisterPage />}
        {route.name === 'login' && <LoginPage />}
        {route.name === 'my-bookings' && <MyBookingsPage />}
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-stone-500 sm:flex-row sm:px-6 lg:px-8">
          <span className="font-display text-base text-stone-800">Stagepass</span>
          <span>Tickets are reserved instantly. Keep your booking code safe.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;