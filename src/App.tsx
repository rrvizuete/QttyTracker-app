import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { AuthPage } from './features/auth/AuthPage';
import { supabase } from './lib/supabase';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      setSession(activeSession);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userEmail = useMemo(() => session?.user.email ?? '', [session]);

  if (isAuthLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">Loading session…</div>;
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <AppShell
      onSignOut={() => {
        void supabase?.auth.signOut();
      }}
      userEmail={userEmail}
    >
      <DashboardPage />
    </AppShell>
  );
}
