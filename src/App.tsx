import SiteHeader from '@/components/SiteHeader';
import EventCatalog from '@/components/EventCatalog';
import EventDetailPage from '@/components/EventDetailPage';
import BookingLookupPage from '@/components/BookingLookupPage';
import { useRoute } from '@/hooks/useRoute';

function App() {
  const route = useRoute();

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-slate-900 antialiased">
      <SiteHeader activeRoute={route.name} />

      <main className="flex-1">
        {route.name === 'home' && <EventCatalog />}
        {route.name === 'event' && <EventDetailPage key={route.id} eventId={route.id} />}
        {route.name === 'bookings' && <BookingLookupPage />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <span className="font-display text-base font-bold text-slate-800">Stagepass</span>
          <span>Tickets are reserved instantly. Keep your booking code safe.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
