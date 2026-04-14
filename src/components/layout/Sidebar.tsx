import { cn } from '../../lib/cn';

const navItems = [
  { name: 'Dashboard', active: true },
  { name: 'Projects' },
  { name: 'Budget Items' },
  { name: 'Progress Updates' },
  { name: 'Reports' },
  { name: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 px-4 py-6 text-slate-100 lg:block">
      <div className="mb-8 px-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">QttyTracker</p>
        <h1 className="mt-1 text-lg font-semibold">Construction Ops</h1>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.name}
            className={cn(
              'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition',
              item.active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
            )}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </nav>
    </aside>
  );
}
