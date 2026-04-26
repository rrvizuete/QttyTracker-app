import type { PropsWithChildren } from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export type AppSection = 'dashboard' | 'projects' | 'budget' | 'progress' | 'settings';

interface AppShellProps extends PropsWithChildren {
  userEmail: string;
  onSignOut: () => void;
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
}

export function AppShell({ children, userEmail, onSignOut, activeSection, onNavigate }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar activeSection={activeSection} onNavigate={onNavigate} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader activeSection={activeSection} onSignOut={onSignOut} userEmail={userEmail} />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
