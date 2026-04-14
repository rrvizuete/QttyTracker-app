import { FormEvent, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { supabase } from '../../lib/supabase';

type AuthMode = 'signin' | 'signup';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const title = useMemo(() => (mode === 'signin' ? 'Sign in to QttyTracker' : 'Create your account'), [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setErrorMessage('Supabase environment variables are missing. Add your real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values to .env.local, then restart the dev server.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    const credentials = {
      email: normalizedEmail,
      password,
    };

    const response =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);

    if (mode === 'signup') {
      setNoticeMessage('Account created. Check your email for a confirmation link before signing in, if your project requires email verification.');
      return;
    }

    setNoticeMessage('Signed in successfully. Redirecting…');
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-md">
        <p className="text-center text-xs uppercase tracking-[0.18em] text-slate-500">QttyTracker</p>
        <h1 className="mt-2 text-center text-2xl font-semibold">Construction Operations</h1>

        <Card className="mt-6">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Use your Supabase email/password credentials to continue.</p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setMode('signin')}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setMode('signup')}
              type="button"
            >
              Sign Up
            </button>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <Input
              autoComplete="email"
              label="Email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
            <Input
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              label="Password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />

            {errorMessage && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>}
            {noticeMessage && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{noticeMessage}</p>}

            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
