import { AlertCircle, Loader2, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import BookingReceiptCard from '@/components/BookingReceiptCard';
import FormField from '@/components/FormField';
import { fetchBooking } from '@/lib/bookingApi';
import type { BookingReceipt } from '@/types/ticketing';

type LookupStatus = 'idle' | 'loading' | 'found' | 'notFound' | 'error';

export default function BookingLookupPage() {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setReceipt(null);
    try {
      const result = await fetchBooking(code.trim(), email.trim());
      if (result) {
        setReceipt(result);
        setStatus('found');
      } else {
        setStatus('notFound');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <p className="text-sm font-medium text-brand-800">Your tickets</p>
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight text-slate-900">Find my booking</h1>
      <p className="mt-3 text-slate-600">
        Enter the booking code from your confirmation and the email you booked with.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-10 space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"
      >
        <FormField
          id="lookup-code"
          label="Booking code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="A1B2C3D4E5"
          autoComplete="off"
          required
          className="uppercase"
        />
        <FormField
          id="lookup-email"
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3.5 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-70"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          {status === 'loading' ? 'Searching...' : 'Find booking'}
        </button>
      </form>

      <div className="mt-8" aria-live="polite">
        {status === 'notFound' && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">
              No booking matches that code and email. Check both and try again.
            </p>
          </div>
        )}
        {status === 'error' && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-rose-50 p-5 text-rose-800 ring-1 ring-rose-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">{errorMessage}</p>
          </div>
        )}
        {status === 'found' && receipt && (
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <BookingReceiptCard receipt={receipt} />
          </div>
        )}
      </div>
    </div>
  );
}
