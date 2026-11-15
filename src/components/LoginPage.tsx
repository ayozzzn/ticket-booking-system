import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const inputClass =
  'w-full rounded-xl border border-wine-900/25 bg-white px-4 py-3 text-wine-900 placeholder:text-wine-900/40 outline-none transition focus:border-crimson focus:ring-4 focus:ring-crimson/15';

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
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-display text-6xl font-medium leading-none text-gold">Log in</h1>
      <p className="mt-4 text-cream-dim">Log in to see your tickets and manage your bookings.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-4 rounded-3xl bg-cream p-6 text-wine-900 shadow-xl shadow-black/40 sm:p-8"
      >
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-wine-900">
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
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-wine-900">
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
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-wine-900/60 hover:text-crimson"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="text-sm text-emerald-700">
            {info}
          </p>
        )}
        {needsConfirm && (
          <button type="button" onClick={handleResend} className="text-sm font-medium text-crimson underline">
            Send the confirmation email again
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-crimson py-3.5 font-semibold text-cream transition hover:bg-crimson-bright disabled:opacity-60"
        >
          {loading ? 'Please wait...' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-cream-dim">
        No account?{' '}
        <a href="#/register" className="font-medium text-gold underline">
          Sign up
        </a>
      </p>
    </div>
  );
}