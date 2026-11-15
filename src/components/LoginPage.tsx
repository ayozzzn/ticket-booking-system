import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setNeedsConfirm(false);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('email not confirmed')) {
        setNeedsConfirm(true);
        setError('Your email is not confirmed yet. Open the link in the email we sent you.');
      } else if (msg.includes('invalid login credentials')) {
        setError('Wrong email or password.');
      } else {
        setError(error.message);
      }
      return;
    }

    window.location.hash = '#/profile';
  }

  async function handleResend() {
    setError('');
    setInfo('');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      return;
    }
    setInfo('Confirmation email sent. Check your inbox and the spam folder.');
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl text-stone-900">Log in</h1>
      <p className="mt-2 text-stone-600">Log in to see your tickets and manage your bookings.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-stone-700">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-stone-900"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-stone-700">
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-3 pr-16 outline-none focus:border-stone-900"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="text-sm text-teal-700">
            {info}
          </p>
        )}
        {needsConfirm && (
          <button
            type="button"
            onClick={handleResend}
            className="text-sm font-medium text-teal-800 underline"
          >
            Send the confirmation email again
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Please wait...' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        No account?{' '}
        <a href="#/register" className="underline">
          Sign up
        </a>
      </p>
    </div>
  );
}