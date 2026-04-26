import type { AppSection } from './AppShell';
import { Button } from '../ui/Button';

interface TopHeaderProps {
  userEmail: string;
  onSignOut: () => void;
  activeSection: AppSection;
}

const sectionTitles: Record<AppSection, { label: string; heading: string }> = {
  dashboard: { label: 'Insights', heading: 'Project Dashboard' },
  projects: { label: 'Projects', heading: 'Project Management' },
  budget: { label: 'Budget', heading: 'Budget Management' },
  progress: { label: 'Progress', heading: 'Progress Tracking' },
  settings: { label: 'Settings', heading: 'Application Settings' },
};

export function TopHeader({ userEmail, onSignOut, activeSection }: TopHeaderProps) {
  const currentTitle = sectionTitles[activeSection];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">{currentTitle.label}</p>
        <h2 className="text-xl font-semibold text-slate-900">{currentTitle.heading}</h2>
      </div>
      <div className="flex items-center gap-2">
        <p className="hidden text-sm text-slate-500 md:block">{userEmail}</p>
        <Button onClick={onSignOut} variant="ghost">
          Sign Out
        </Button>
      </div>
    </header>
  );
}
