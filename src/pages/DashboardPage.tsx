import { kpiCards } from '../data/dashboard';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { BudgetTable } from '../components/ui/Table';
import { KpiCard } from '../components/ui/KpiCard';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Project Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Base app shell and design system scaffold for upcoming feature phases.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Budget Tracking</h3>
            <p className="text-sm text-slate-500">Latest synced data</p>
          </div>
          <BudgetTable />
        </div>

        <Card>
          <h3 className="text-lg font-semibold text-slate-900">Quick Progress Update</h3>
          <p className="mt-1 text-sm text-slate-500">Reusable form scaffold for Phase 4 progress updates.</p>
          <form className="mt-4 space-y-4">
            <Input label="Item Code" placeholder="03-100" />
            <Input label="Installed Quantity" placeholder="e.g. 1200" helperText="Use project unit for the selected budget item." />
            <Input label="Remarks" placeholder="Optional progress remarks" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
              <Button type="submit">Save Draft</Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
