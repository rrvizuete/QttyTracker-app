import { Button } from '../ui/Button';

export function TopHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Project</p>
        <h2 className="text-xl font-semibold text-slate-900">Central Plaza Tower</h2>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary">Export</Button>
        <Button>New Update</Button>
      </div>
    </header>
  );
}
