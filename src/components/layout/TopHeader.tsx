import { Button } from '../ui/Button';

interface TopHeaderProps {
  userEmail: string;
  onSignOut: () => void;
}

export function TopHeader({ userEmail, onSignOut }: TopHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Project</p>
        <h2 className="text-xl font-semibold text-slate-900">Central Plaza Tower</h2>
      </div>
      <div className="flex items-center gap-2">
        <p className="hidden text-sm text-slate-500 md:block">{userEmail}</p>
        <Button variant="secondary">Export</Button>
        <Button>New Update</Button>
        <Button onClick={onSignOut} variant="ghost">
          Sign Out
        </Button>
      </div>
    </header>
  );
}
