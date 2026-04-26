import type { AppSection } from './AppShell';
import { cn } from '../../lib/cn';

const navItems: Array<{ name: string; section: AppSection }> = [
  { name: 'Projects', section: 'projects' },
  { name: 'Budget', section: 'budget' },
  { name: 'Dashboard', section: 'dashboard' },
];

interface SidebarProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
}

export function Sidebar({ activeSection, onNavigate }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 px-4 py-6 text-slate-100 lg:block">
      <div className="mb-8 px-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Quantities Manager</p>
        <h1 className="mt-1 text-lg font-semibold">Construction Project Quantities</h1>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.name}
            className={cn(
              'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition',
              item.section === activeSection ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
            )}
            onClick={() => onNavigate(item.section)}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </nav>
    </aside>
  );
}
