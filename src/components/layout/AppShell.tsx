import type { PropsWithChildren } from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

interface AppShellProps extends PropsWithChildren {
  userEmail: string;
  onSignOut: () => void;
}

export function AppShell({ children, userEmail, onSignOut }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader onSignOut={onSignOut} userEmail={userEmail} />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
