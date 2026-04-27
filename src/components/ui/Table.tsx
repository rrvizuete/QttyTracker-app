import { budgetRows } from '../../data/dashboard';

export function BudgetTable() {
  return (
    <div className="overflow-hidden rounded-panel border border-slate-200 bg-white shadow-panel">
      <div className="max-h-[45vh] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Code</th>
              <th className="px-4 py-3 text-left font-semibold">Description</th>
              <th className="px-4 py-3 text-right font-semibold">Budget Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Installed</th>
              <th className="px-4 py-3 text-right font-semibold">Progress</th>
              <th className="px-4 py-3 text-right font-semibold">Budget Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {budgetRows.map((row) => (
              <tr key={row.code} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-medium text-slate-800">{row.code}</td>
                <td className="px-4 py-3 text-slate-700">{row.description}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.budgetQty}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.installedQty}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-600">{row.percent}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
