import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { AuthPage } from './features/auth/AuthPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { BudgetPage } from './pages/BudgetPage';
import { ProgressPage } from './pages/ProgressPage';
import { provisionUserProfile } from './lib/profile';
import { supabase } from './lib/supabase';
import { SettingsPage } from './pages/SettingsPage';

type AppSection = 'dashboard' | 'projects' | 'budget' | 'progress' | 'settings';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AppSection>('projects');

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;

      if (data.session) {
        await provisionUserProfile(data.session);
      }

      setSession(data.session);
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      if (activeSession) {
        void provisionUserProfile(activeSession);
      }

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
      activeSection={activeSection}
      onNavigate={setActiveSection}
      onSignOut={() => {
        void supabase?.auth.signOut();
      }}
      userEmail={userEmail}
    >
      {activeSection === 'dashboard' ? <DashboardPage /> : null}
      {activeSection === 'projects' ? <ProjectsPage session={session} /> : null}
      {activeSection === 'budget' ? <BudgetPage session={session} /> : null}
      {activeSection === 'progress' ? <ProgressPage session={session} /> : null}
      {activeSection === 'settings' ? <SettingsPage session={session} /> : null}
    </AppShell>
  );
}
