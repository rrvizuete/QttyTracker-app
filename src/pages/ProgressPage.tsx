import { useEffect, useMemo, useState } from 'react';
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

interface ProgressEditor {
  id: string | null;
  budget_item_id: string;
  reporting_date: string;
  installed_quantity: string;
  percent_complete: string;
  remarks: string;
}

export function ProgressPage({ session }: ProgressPageProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [budgetItems, setBudgetItems] = useState<BudgetItemOption[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<ProgressEditor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [budgetFilter, setBudgetFilter] = useState('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredHistory = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return progressRows.filter((row) => {
      const matchesFilter = budgetFilter === 'all' || row.budget_item_id === budgetFilter;
      const code = row.budget_item?.[0]?.code?.toLowerCase() ?? '';
      const description = row.budget_item?.[0]?.description?.toLowerCase() ?? '';
      const remark = (row.remarks ?? '').toLowerCase();
      const matchesSearch = term.length === 0 || code.includes(term) || description.includes(term) || remark.includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [budgetFilter, progressRows, searchTerm]);

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

  async function fetchProjectData(projectId: string) {
    if (!supabase || !projectId) {
      setBudgetItems([]);
      setProgressRows([]);
      return;
    }

    const [budgetResponse, progressResponse] = await Promise.all([
      supabase.from('budget_items').select('id,code,description,quantity,uom').eq('project_id', projectId).order('code'),
      supabase
        .from('progress_updates')
        .select('id,project_id,budget_item_id,installed_quantity,percent_complete,reporting_date,remarks,created_at,reporter_id,budget_item:budget_items(code,description,uom)')
        .eq('project_id', projectId)
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
    setBudgetFilter('all');
    setEditingRow(null);
  }

  useEffect(() => {
    void fetchProjectData(selectedProjectId);
  }, [selectedProjectId]);

  function startCreateInline() {
    if (budgetItems.length === 0) {
      setErrorMessage('Create budget items first before adding progress updates.');
      return;
    }

    setEditingRow({
      id: null,
      budget_item_id: budgetItems[0].id,
      reporting_date: new Date().toISOString().slice(0, 10),
      installed_quantity: '',
      percent_complete: '',
      remarks: '',
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function startEditInline(row: ProgressRecord) {
    setEditingRow({
      id: row.id,
      budget_item_id: row.budget_item_id,
      reporting_date: row.reporting_date,
      installed_quantity: String(row.installed_quantity),
      percent_complete: row.percent_complete === null ? '' : String(row.percent_complete),
      remarks: row.remarks ?? '',
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function saveInline() {
    if (!supabase || !selectedProjectId || !editingRow) {
      return;
    }

    const qty = Number(editingRow.installed_quantity);
    const percent = editingRow.percent_complete.trim() ? Number(editingRow.percent_complete) : null;

    if (!Number.isFinite(qty) || qty < 0) {
      setErrorMessage('Installed quantity must be a valid value >= 0.');
      return;
    }

    if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      setErrorMessage('Percent complete must be between 0 and 100.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!editingRow.id) {
      const response = await supabase
        .from('progress_updates')
        .insert({
          project_id: selectedProjectId,
          budget_item_id: editingRow.budget_item_id,
          reporting_date: editingRow.reporting_date,
          installed_quantity: qty,
          percent_complete: percent,
          remarks: editingRow.remarks.trim() || null,
          reporter_id: session.user.id,
        })
        .select('id,project_id,budget_item_id,installed_quantity,percent_complete,reporting_date,remarks,created_at,reporter_id,budget_item:budget_items(code,description,uom)')
        .single();

      setIsSaving(false);

      if (response.error) {
        setErrorMessage(response.error.message);
        return;
      }

      setProgressRows((current) => [response.data as ProgressRecord, ...current]);
      setEditingRow(null);
      setSuccessMessage('Progress update created successfully.');
      return;
    }

    const response = await supabase
      .from('progress_updates')
      .update({
        budget_item_id: editingRow.budget_item_id,
        reporting_date: editingRow.reporting_date,
        installed_quantity: qty,
        percent_complete: percent,
        remarks: editingRow.remarks.trim() || null,
      })
      .eq('id', editingRow.id)
      .eq('project_id', selectedProjectId)
      .select('id,project_id,budget_item_id,installed_quantity,percent_complete,reporting_date,remarks,created_at,reporter_id,budget_item:budget_items(code,description,uom)')
      .single();

    setIsSaving(false);

    if (response.error) {
      setErrorMessage(response.error.message);
      return;
    }

    setProgressRows((current) => current.map((row) => (row.id === response.data.id ? (response.data as ProgressRecord) : row)));
    setEditingRow(null);
    setSuccessMessage('Progress update saved successfully.');
  }

  async function handleDelete(row: ProgressRecord) {
    if (!supabase) {
      return;
    }

    const confirmed = window.confirm(`Delete progress entry for ${row.budget_item?.[0]?.code ?? 'this item'} on ${row.reporting_date}?`);
    if (!confirmed) {
      return;
    }

    setDeletingId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await supabase.from('progress_updates').delete().eq('id', row.id);

    setDeletingId(null);

    if (response.error) {
      setErrorMessage(response.error.message);
      return;
    }

    setProgressRows((current) => current.filter((item) => item.id !== row.id));
    setSuccessMessage('Progress entry deleted successfully.');
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Progress Tracking</h1>
        <p className="mt-1 text-sm text-slate-500">Manage and update progress entries directly from the table.</p>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-64 flex-col gap-2 text-sm font-medium text-slate-700">
            <span>Project</span>
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(e) => setSelectedProjectId(e.target.value)} value={selectedProjectId}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!selectedProjectId || isSaving} onClick={startCreateInline} type="button">
            Add Progress Row
          </Button>
        </div>

        {errorMessage ? <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
        {successMessage ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}

        {!isLoading ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>Item</p>
                      <select className="h-7 w-full rounded border border-slate-300 bg-white px-1 text-xs normal-case" onChange={(e) => setBudgetFilter(e.target.value)} value={budgetFilter}>
                        <option value="all">All items</option>
                        {budgetItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>Description</p>
                      <input className="h-7 w-full rounded border border-slate-300 px-2 text-xs normal-case" onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search" value={searchTerm} />
                    </div>
                  </th>
                  <th className="py-2 pr-3">Installed Qty</th>
                  <th className="py-2 pr-3">% Complete</th>
                  <th className="py-2 pr-3">Remarks</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {editingRow?.id === null ? (
                  <tr className="border-b border-brand-100 bg-brand-50/70">
                    <td className="py-2 pr-3"><input className="h-8 rounded-md border border-slate-300 px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, reporting_date: e.target.value } : c))} type="date" value={editingRow.reporting_date} /></td>
                    <td className="py-2 pr-3">
                      <select className="h-8 rounded-md border border-slate-300 bg-white px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, budget_item_id: e.target.value } : c))} value={editingRow.budget_item_id}>
                        {budgetItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.code}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{budgetItems.find((item) => item.id === editingRow.budget_item_id)?.description ?? '—'}</td>
                    <td className="py-2 pr-3"><input className="h-8 w-24 rounded-md border border-slate-300 px-2" min="0" onChange={(e) => setEditingRow((c) => (c ? { ...c, installed_quantity: e.target.value } : c))} step="0.001" type="number" value={editingRow.installed_quantity} /></td>
                    <td className="py-2 pr-3"><input className="h-8 w-24 rounded-md border border-slate-300 px-2" max="100" min="0" onChange={(e) => setEditingRow((c) => (c ? { ...c, percent_complete: e.target.value } : c))} step="0.01" type="number" value={editingRow.percent_complete} /></td>
                    <td className="py-2 pr-3"><input className="h-8 w-full rounded-md border border-slate-300 px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, remarks: e.target.value } : c))} value={editingRow.remarks} /></td>
                    <td className="py-2 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button className="px-2 py-1 text-xs" disabled={isSaving} onClick={saveInline} type="button">{isSaving ? 'Saving…' : 'Save'}</Button>
                        <Button className="px-2 py-1 text-xs" onClick={() => setEditingRow(null)} type="button" variant="ghost">Cancel</Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {filteredHistory.map((row) => {
                  const isEditing = editingRow?.id === row.id;
                  return (
                    <tr className="border-b border-slate-100" key={row.id}>
                      <td className="py-3 pr-3 text-slate-700">
                        {isEditing ? (
                          <input className="h-8 rounded-md border border-slate-300 px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, reporting_date: e.target.value } : c))} type="date" value={editingRow.reporting_date} />
                        ) : new Date(row.reporting_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-3 font-medium text-slate-800">
                        {isEditing ? (
                          <select className="h-8 rounded-md border border-slate-300 bg-white px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, budget_item_id: e.target.value } : c))} value={editingRow.budget_item_id}>
                            {budgetItems.map((item) => (
                              <option key={item.id} value={item.id}>{item.code}</option>
                            ))}
                          </select>
                        ) : (row.budget_item?.[0]?.code ?? '—')}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{isEditing ? budgetItems.find((item) => item.id === editingRow.budget_item_id)?.description ?? '—' : (row.budget_item?.[0]?.description ?? '—')}</td>
                      <td className="py-3 pr-3 text-slate-700">
                        {isEditing ? (
                          <input className="h-8 w-24 rounded-md border border-slate-300 px-2" min="0" onChange={(e) => setEditingRow((c) => (c ? { ...c, installed_quantity: e.target.value } : c))} step="0.001" type="number" value={editingRow.installed_quantity} />
                        ) : row.installed_quantity}
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {isEditing ? (
                          <input className="h-8 w-24 rounded-md border border-slate-300 px-2" max="100" min="0" onChange={(e) => setEditingRow((c) => (c ? { ...c, percent_complete: e.target.value } : c))} step="0.01" type="number" value={editingRow.percent_complete} />
                        ) : (row.percent_complete ?? '—')}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {isEditing ? (
                          <input className="h-8 w-full rounded-md border border-slate-300 px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, remarks: e.target.value } : c))} value={editingRow.remarks} />
                        ) : (row.remarks ?? '—')}
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <div className="flex gap-1">
                          {isEditing ? (
                            <>
                              <Button className="px-2 py-1 text-xs" disabled={isSaving} onClick={saveInline} type="button">{isSaving ? 'Saving…' : 'Save'}</Button>
                              <Button className="px-2 py-1 text-xs" onClick={() => setEditingRow(null)} type="button" variant="ghost">Cancel</Button>
                            </>
                          ) : (
                            <Button className="px-2 py-1 text-xs" onClick={() => startEditInline(row)} type="button" variant="ghost">Edit</Button>
                          )}
                          <Button className="px-2 py-1 text-xs" disabled={deletingId === row.id} onClick={() => handleDelete(row)} type="button" variant="danger">
                            {deletingId === row.id ? 'Deleting…' : 'Delete'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        )}
      </Card>
    </div>
  );
}
