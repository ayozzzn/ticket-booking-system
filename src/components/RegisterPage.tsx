import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const inputClass =
  'w-full rounded-xl border border-wine-900/25 bg-white px-4 py-3 text-wine-900 placeholder:text-wine-900/40 outline-none transition focus:border-crimson focus:ring-4 focus:ring-crimson/15';

function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8 && password.length <= 12,
    chars: password.length > 0 && /^[A-Za-z0-9]+$/.test(password),
    letter: /[A-Za-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [done, setDone] = useState(false);

  const checks = getPasswordChecks(password);
  const passwordValid = checks.length && checks.chars && checks.letter && checks.number;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!passwordValid) {
      setError(
        'Password is not accepted. It must be 8-12 characters, contain letters and numbers, and use only letters and numbers.',
      );
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // With "Confirm email" ON, Supabase does not return an error for an address that is
    // already registered. It returns a user with an empty identities list instead.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('This email is already registered. Log in instead.');
      return;
    }

    if (data.session) {
      // "Confirm email" is OFF: the user is already signed in.
      window.location.hash = '#/profile';
      return;
    }
    setDone(true);
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
    setInfo('Confirmation email sent again.');
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-3xl bg-cream p-8 text-center text-wine-900 shadow-xl shadow-black/40">
          <h1 className="font-display text-4xl font-semibold text-wine-900">Check your email</h1>
          <p className="mt-3 text-wine-900/75">
            We sent a confirmation link to <span className="font-semibold text-wine-900">{email.trim()}</span>.
            Open it, then log in. If it is not there in a minute, check the spam folder.
          </p>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          {info && <p className="mt-3 text-sm text-emerald-700">{info}</p>}
          <button type="button" onClick={handleResend} className="mt-4 text-sm font-medium text-crimson underline">
            Send the email again
          </button>
          <div>
            <a
              href="#/login"
              className="mt-6 inline-block rounded-full bg-crimson px-6 py-3 font-semibold text-cream transition hover:bg-crimson-bright"
            >
              Go to log in
            </a>
          </div>
        </div>
      </div>
    );
  }

  const rules: { ok: boolean; text: string }[] = [
    { ok: checks.length, text: '8 to 12 characters' },
    { ok: checks.chars, text: 'Only letters and numbers (no spaces or symbols)' },
    { ok: checks.letter, text: 'At least one letter' },
    { ok: checks.number, text: 'At least one number' },
  ];

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-display text-6xl font-medium leading-none text-gold">Create an account</h1>
      <p className="mt-4 text-cream-dim">
        With an account all your tickets are in one place and you can cancel them there. Registration is
        optional: you can still book without it.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-4 rounded-3xl bg-cream p-6 text-wine-900 shadow-xl shadow-black/40 sm:p-8"
      >
        <div>
          <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium text-wine-900">
            Full name
          </label>
          <input
            id="reg-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Morgan"
            autoComplete="name"
            maxLength={120}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-wine-900">
            Email
          </label>
          <input
            id="reg-email"
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
          <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-wine-900">
            Password
          </label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={20}
              autoComplete="new-password"
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

          <div className="mt-3 rounded-xl bg-white/60 p-3 ring-1 ring-wine-900/15">
            <p className="text-sm font-medium text-wine-900">Your password must contain:</p>
            <ul className="mt-2 space-y-1 text-sm">
              {rules.map((rule) => (
                <li key={rule.text} className={rule.ok ? 'text-emerald-700' : 'text-wine-900/55'}>
                  <span className="mr-2 inline-block w-4 font-bold">{rule.ok ? '✓' : '○'}</span>
                  {rule.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <label htmlFor="reg-confirm" className="mb-1.5 block text-sm font-medium text-wine-900">
            Confirm password
          </label>
          <input
            id="reg-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            maxLength={20}
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-crimson py-3.5 font-semibold text-cream transition hover:bg-crimson-bright disabled:opacity-60"
        >
          {loading ? 'Please wait...' : 'Register'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-cream-dim">
        Already have an account?{' '}
        <a href="#/login" className="font-medium text-gold underline">
          Log in
        </a>
      </p>

      <div className="mt-3 text-center">
        <a href="#/" className="text-sm text-cream-dim underline hover:text-cream">
          Skip for now
        </a>
      </div>
    </div>
  );
}