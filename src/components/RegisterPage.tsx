import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Method = 'email' | 'phone';

function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8 && password.length <= 12,
    chars: password.length > 0 && /^[A-Za-z0-9]+$/.test(password),
    letter: /[A-Za-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

export default function RegisterPage() {
  const [method, setMethod] = useState<Method>('email');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const checks = getPasswordChecks(password);
  const passwordValid = checks.length && checks.chars && checks.letter && checks.number;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!passwordValid) {
      setError(
        'Password is not accepted. It must be 8-12 characters, contain letters and numbers, and use only letters and numbers.'
      );
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } =
      method === 'email'
        ? await supabase.auth.signUp({ email: contact.trim(), password })
        : await supabase.auth.signUp({ phone: contact.trim(), password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl text-stone-900">You are registered</h1>
        <p className="mt-3 text-stone-600">
          {method === 'email'
            ? 'Check your email to confirm your account.'
            : 'Check your phone for the confirmation code.'}
        </p>
        <a
          href="#/"
          className="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-white"
        >
          Browse events
        </a>
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
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl text-stone-900">Create an account</h1>
      <p className="mt-2 text-stone-600">
        Registration is optional. You can book tickets without it.
      </p>

      <div className="mt-6 grid grid-cols-2 rounded-lg bg-stone-200 p-1 text-sm">
        {(['email', 'phone'] as Method[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMethod(m);
              setContact('');
              setError('');
            }}
            className={`rounded-md py-2 font-medium ${
              method === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
            }`}
          >
            {m === 'email' ? 'Email' : 'Phone number'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            {method === 'email' ? 'Email' : 'Phone number'}
          </label>
          <input
            type={method === 'email' ? 'email' : 'tel'}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={method === 'email' ? 'you@example.com' : '+77001234567'}
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
              maxLength={20}
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

          <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3">
            <p className="text-sm font-medium text-stone-700">
              Your password must contain:
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {rules.map((rule) => (
                <li
                  key={rule.text}
                  className={rule.ok ? 'text-teal-700' : 'text-stone-500'}
                >
                  <span className="mr-2 inline-block w-4 font-bold">
                    {rule.ok ? '✓' : '○'}
                  </span>
                  {rule.text}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">
              If these rules are not met, the password is not accepted.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Confirm password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            maxLength={20}
            required
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-stone-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Please wait...' : 'Register'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <a href="#/" className="text-sm text-stone-600 underline">
          Skip for now
        </a>
      </div>
    </div>
  );
}