import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setError('Wrong email or password.');
      return;
    }

    window.location.hash = '#/my-bookings';
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl text-stone-900">Log in</h1>
      <p className="mt-2 text-stone-600">Log in to see your tickets.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-stone-900"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        {error && <p className="text-sm text-red-600">{error}</p>}

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