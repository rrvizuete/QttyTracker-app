import { Card } from './Card';

interface KpiCardProps {
  label: string;
  value: string;
  trend: string;
}

export function KpiCard({ label, value, trend }: KpiCardProps) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{trend}</p>
    </Card>
  );
}
