import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';

interface ProgressPageProps {
  session: Session;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface BudgetItemOption {
  id: string;
  code: string;
  description: string;
  quantity: number;
  uom: string;
}

interface ProgressRecord {
  id: string;
  project_id: string;
  budget_item_id: string;
  installed_quantity: number;
  percent_complete: number | null;
  reporting_date: string;
  remarks: string | null;
  created_at: string;
  reporter_id: string;
  budget_item: Array<{ code: string; description: string; uom: string }> | null;
}

export function ProgressPage({ session }: ProgressPageProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [budgetItems, setBudgetItems] = useState<BudgetItemOption[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRecord[]>([]);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [reportingDate, setReportingDate] = useState(new Date().toISOString().slice(0, 10));
  const [installedQuantity, setInstalledQuantity] = useState('');
  const [percentComplete, setPercentComplete] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [historyItemFilter, setHistoryItemFilter] = useState('all');

  const selectedItem = useMemo(() => budgetItems.find((item) => item.id === selectedBudgetItemId) ?? null, [budgetItems, selectedBudgetItemId]);

  const filteredBudgetItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return budgetItems;
    return budgetItems.filter((item) => item.code.toLowerCase().includes(term) || item.description.toLowerCase().includes(term));
  }, [budgetItems, itemSearch]);

  const filteredHistory = useMemo(() => {
    if (historyItemFilter === 'all') {
      return progressRows;
    }
    return progressRows.filter((row) => row.budget_item_id === historyItemFilter);
  }, [historyItemFilter, progressRows]);

  useEffect(() => {
    let isActive = true;

    async function bootstrap() {
      if (!supabase) {
        setErrorMessage('Supabase environment variables are missing.');
        setIsLoading(false);
        return;
      }

      const projectsResponse = await supabase.from('projects').select('id,name').order('name');
      if (!isActive) return;

      if (projectsResponse.error) {
        setErrorMessage(projectsResponse.error.message);
        setIsLoading(false);
        return;
      }

      const projectRows = projectsResponse.data ?? [];
      setProjects(projectRows);
      setSelectedProjectId(projectRows[0]?.id ?? '');
      setIsLoading(false);
    }

    void bootstrap();
    return () => {
      isActive = false;
    };
  }, [session.user.id]);

  useEffect(() => {
    async function fetchProjectData() {
      if (!supabase || !selectedProjectId) {
        setBudgetItems([]);
        setProgressRows([]);
        return;
      }

      const [budgetResponse, progressResponse] = await Promise.all([
        supabase.from('budget_items').select('id,code,description,quantity,uom').eq('project_id', selectedProjectId).order('code'),
        supabase
          .from('progress_updates')
          .select('id,project_id,budget_item_id,installed_quantity,percent_complete,reporting_date,remarks,created_at,reporter_id,budget_item:budget_items(code,description,uom)')
          .eq('project_id', selectedProjectId)
          .order('reporting_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      if (budgetResponse.error) {
        setErrorMessage(budgetResponse.error.message);
        return;
      }

      if (progressResponse.error) {
        setErrorMessage(progressResponse.error.message);
        return;
      }

      setBudgetItems(budgetResponse.data ?? []);
      setProgressRows((progressResponse.data ?? []) as ProgressRecord[]);
      setSelectedBudgetItemId((current) => current || budgetResponse.data?.[0]?.id || '');
      setHistoryItemFilter('all');
    }

    void fetchProjectData();
  }, [selectedProjectId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedProjectId || !selectedBudgetItemId) {
      setErrorMessage('Select project and budget item first.');
      return;
    }

    const qty = Number(installedQuantity);
    const percent = percentComplete.trim() ? Number(percentComplete) : null;

    if (!Number.isFinite(qty) || qty < 0) {
      setErrorMessage('Installed quantity must be a valid value >= 0.');
      return;
    }

    if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      setErrorMessage('Percent complete must be between 0 and 100.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await supabase
      .from('progress_updates')
      .insert({
        project_id: selectedProjectId,
        budget_item_id: selectedBudgetItemId,
        reporting_date: reportingDate,
        installed_quantity: qty,
        percent_complete: percent,
        remarks: remarks.trim() || null,
        reporter_id: session.user.id,
      })
      .select('id,project_id,budget_item_id,installed_quantity,percent_complete,reporting_date,remarks,created_at,reporter_id,budget_item:budget_items(code,description,uom)')
      .single();

    setIsSubmitting(false);

    if (response.error) {
      setErrorMessage(response.error.message);
      return;
    }

    setProgressRows((current) => [response.data as ProgressRecord, ...current]);
    setInstalledQuantity('');
    setPercentComplete('');
    setRemarks('');
    setSuccessMessage('Progress update submitted successfully.');
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Progress Tracking</h1>
        <p className="mt-1 text-sm text-slate-500">Submit and review progress updates for budget items only.</p>
      </section>

      <Card>
        <label className="flex max-w-sm flex-col gap-2 text-sm font-medium text-slate-700">
          <span>Project</span>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(e) => setSelectedProjectId(e.target.value)} value={selectedProjectId}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">New Update</h2>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Search Budget Item</span>
              <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" onChange={(e) => setItemSearch(e.target.value)} placeholder="Code or description" value={itemSearch} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Item Code</span>
              <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(e) => setSelectedBudgetItemId(e.target.value)} required value={selectedBudgetItemId}>
                <option value="">Select budget item</option>
                {filteredBudgetItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.description}
                  </option>
                ))}
              </select>
            </label>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Description: {selectedItem?.description ?? '—'} ({selectedItem?.uom ?? '—'})</p>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Reporter</span>
              <input className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" readOnly value={session.user.email ?? session.user.id} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Reporting Date</span>
              <input className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(e) => setReportingDate(e.target.value)} required type="date" value={reportingDate} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Installed Quantity</span>
              <input className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" min="0" onChange={(e) => setInstalledQuantity(e.target.value)} required step="0.001" type="number" value={installedQuantity} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Percent Complete (optional)</span>
              <input className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" max="100" min="0" onChange={(e) => setPercentComplete(e.target.value)} step="0.01" type="number" value={percentComplete} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Remarks</span>
              <textarea className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onChange={(e) => setRemarks(e.target.value)} rows={3} value={remarks} />
            </label>
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Submitting…' : 'Submit Progress Update'}
            </Button>
          </form>
          {errorMessage ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Progress History</h2>
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(e) => setHistoryItemFilter(e.target.value)} value={historyItemFilter}>
              <option value="all">All budget items</option>
              {budgetItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}

          {!isLoading && filteredHistory.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Installed Qty</th>
                    <th className="py-2 pr-3">% Complete</th>
                    <th className="py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((row) => (
                    <tr className="border-b border-slate-100" key={row.id}>
                      <td className="py-3 pr-3 text-slate-700">{new Date(row.reporting_date).toLocaleDateString()}</td>
                      <td className="py-3 pr-3 font-medium text-slate-800">{row.budget_item?.[0]?.code ?? '—'}</td>
                      <td className="py-3 pr-3 text-slate-600">{row.budget_item?.[0]?.description ?? '—'}</td>
                      <td className="py-3 pr-3 text-slate-700">{row.installed_quantity}</td>
                      <td className="py-3 pr-3 text-slate-700">{row.percent_complete ?? '—'}</td>
                      <td className="py-3 text-slate-600">{row.remarks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
