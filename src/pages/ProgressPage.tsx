import { useCallback, useEffect, useMemo, useState } from 'react';
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
  itemQuery: string;
  descriptionQuery: string;
  reporting_date: string;
  installed_quantity: string;
  percent_complete: string;
  remarks: string;
}

function formatDateInputFromLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatReportingDate(dateValue: string): string {
  const [yearRaw, monthRaw, dayRaw] = dateValue.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateValue;
  }

  return new Date(year, month - 1, day).toLocaleDateString();
}

function toRoundedString(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return String(rounded);
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
  const [openPicker, setOpenPicker] = useState<'item' | 'description' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [budgetFilter, setBudgetFilter] = useState('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const budgetItemLookup = useMemo(() => new Map(budgetItems.map((item) => [item.id, item])), [budgetItems]);

  const getBudgetQuantity = useCallback((budgetItemId: string): number | null => {
    const quantity = budgetItemLookup.get(budgetItemId)?.quantity;
    if (!Number.isFinite(quantity) || !quantity || quantity <= 0) {
      return null;
    }
    return quantity;
  }, [budgetItemLookup]);

  const calculatePercentFromInstalled = useCallback((installedQuantity: string, budgetItemId: string): string | null => {
    const budgetQty = getBudgetQuantity(budgetItemId);
    const installed = Number(installedQuantity);
    if (!budgetQty || !Number.isFinite(installed) || installed < 0) {
      return null;
    }

    const percent = (installed / budgetQty) * 100;
    return toRoundedString(percent, 2);
  }, [getBudgetQuantity]);

  const calculateInstalledFromPercent = useCallback((percentComplete: string, budgetItemId: string): string | null => {
    const budgetQty = getBudgetQuantity(budgetItemId);
    const percent = Number(percentComplete);
    if (!budgetQty || !Number.isFinite(percent) || percent < 0) {
      return null;
    }

    const installedQty = (percent / 100) * budgetQty;
    return toRoundedString(installedQty, 3);
  }, [getBudgetQuantity]);

  const handleInstalledQuantityChange = useCallback((value: string) => {
    setEditingRow((current) => {
      if (!current) {
        return current;
      }

      const next: ProgressEditor = { ...current, installed_quantity: value };
      if (!value.trim()) {
        next.percent_complete = '';
        return next;
      }

      const calculatedPercent = calculatePercentFromInstalled(value, next.budget_item_id);
      if (calculatedPercent !== null) {
        next.percent_complete = calculatedPercent;
      }

      return next;
    });
  }, [calculatePercentFromInstalled]);

  const handlePercentCompleteChange = useCallback((value: string) => {
    setEditingRow((current) => {
      if (!current) {
        return current;
      }

      const next: ProgressEditor = { ...current, percent_complete: value };
      if (!value.trim()) {
        next.installed_quantity = '';
        return next;
      }

      const calculatedInstalled = calculateInstalledFromPercent(value, next.budget_item_id);
      if (calculatedInstalled !== null) {
        next.installed_quantity = calculatedInstalled;
      }

      return next;
    });
  }, [calculateInstalledFromPercent]);

  const matchingCodeItems = useMemo(() => {
    if (!editingRow) {
      return [];
    }

    const query = editingRow.itemQuery.trim().toLowerCase();
    if (!query) {
      return budgetItems.slice(0, 40);
    }

    return budgetItems
      .filter((item) => item.code.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
      .slice(0, 40);
  }, [budgetItems, editingRow]);

  const matchingDescriptionItems = useMemo(() => {
    if (!editingRow) {
      return [];
    }

    const query = editingRow.descriptionQuery.trim().toLowerCase();
    if (!query) {
      return budgetItems.slice(0, 40);
    }

    return budgetItems
      .filter((item) => item.description.toLowerCase().includes(query) || item.code.toLowerCase().includes(query))
      .slice(0, 40);
  }, [budgetItems, editingRow]);

  const getRowItemMeta = useCallback((row: ProgressRecord) => {
    const linked = budgetItemLookup.get(row.budget_item_id);
    return {
      code: row.budget_item?.[0]?.code ?? linked?.code ?? '—',
      description: row.budget_item?.[0]?.description ?? linked?.description ?? '—',
      uom: row.budget_item?.[0]?.uom ?? linked?.uom ?? '—',
    };
  }, [budgetItemLookup]);

  const filteredHistory = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return progressRows.filter((row) => {
      const matchesFilter = budgetFilter === 'all' || row.budget_item_id === budgetFilter;
      const meta = getRowItemMeta(row);
      const remark = (row.remarks ?? '').toLowerCase();
      const matchesSearch =
        term.length === 0 ||
        meta.code.toLowerCase().includes(term) ||
        meta.description.toLowerCase().includes(term) ||
        meta.uom.toLowerCase().includes(term) ||
        remark.includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [budgetFilter, progressRows, searchTerm, getRowItemMeta]);

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

  function setEditorFromBudgetItem(itemId: string, existing?: ProgressEditor | null) {
    const item = budgetItemLookup.get(itemId);
    const itemQuery = item ? `${item.code} — ${item.description}` : '';
    const descriptionQuery = item?.description ?? '';

    setEditingRow((current) => {
      const base = existing ?? current;
      if (!base) {
        return null;
      }

      const next: ProgressEditor = {
        ...base,
        budget_item_id: itemId,
        itemQuery,
        descriptionQuery,
      };

      if (next.installed_quantity.trim()) {
        next.percent_complete = calculatePercentFromInstalled(next.installed_quantity, itemId) ?? next.percent_complete;
      } else if (next.percent_complete.trim()) {
        next.installed_quantity = calculateInstalledFromPercent(next.percent_complete, itemId) ?? next.installed_quantity;
      }

      return next;
    });
  }

  function resolveItemFromQuery(query: string): BudgetItemOption | null {
    const value = query.trim().toLowerCase();
    if (!value) {
      return null;
    }

    const partialMatches = budgetItems.filter((item) => item.code.toLowerCase().includes(value) || item.description.toLowerCase().includes(value));

    return (
      budgetItems.find((item) => `${item.code} — ${item.description}`.toLowerCase() === value) ??
      budgetItems.find((item) => item.description.toLowerCase() === value) ??
      budgetItems.find((item) => item.code.toLowerCase() === value) ??
      (partialMatches.length === 1 ? partialMatches[0] : null) ??
      null
    );
  }

  function normalizeLookupText(value: string): string {
    return value.trim().toLowerCase();
  }

  function handlePickerSelect(item: BudgetItemOption) {
    setEditorFromBudgetItem(item.id);
    setOpenPicker(null);
  }

  function startCreateInline() {
    if (budgetItems.length === 0) {
      setErrorMessage('Create budget items first before adding progress updates.');
      return;
    }

    setEditingRow({
      id: null,
      budget_item_id: '',
      itemQuery: '',
      descriptionQuery: '',
      reporting_date: formatDateInputFromLocalDate(new Date()),
      installed_quantity: '',
      percent_complete: '',
      remarks: '',
    });
    setOpenPicker(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function startEditInline(row: ProgressRecord) {
    const linked = budgetItemLookup.get(row.budget_item_id);
    const code = row.budget_item?.[0]?.code ?? linked?.code ?? '';
    const description = row.budget_item?.[0]?.description ?? linked?.description ?? '';

    setEditingRow({
      id: row.id,
      budget_item_id: row.budget_item_id,
      itemQuery: `${code} — ${description}`.trim(),
      descriptionQuery: description,
      reporting_date: row.reporting_date,
      installed_quantity: String(row.installed_quantity),
      percent_complete: row.percent_complete === null ? '' : String(row.percent_complete),
      remarks: row.remarks ?? '',
    });
    setOpenPicker(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function saveInline() {
    if (!supabase || !selectedProjectId || !editingRow) {
      return;
    }

    const resolvedItem =
      resolveItemFromQuery(editingRow.itemQuery) ??
      resolveItemFromQuery(editingRow.descriptionQuery) ??
      null;
    const selectedItem = budgetItemLookup.get(editingRow.budget_item_id);
    const selectedComposite = selectedItem ? `${selectedItem.code} — ${selectedItem.description}` : '';
    const budgetItemId = resolvedItem?.id ?? editingRow.budget_item_id;
    const userTypedValue = editingRow.itemQuery.trim() || editingRow.descriptionQuery.trim();

    if (!userTypedValue && !budgetItemId) {
      setErrorMessage('Select a budget item before saving.');
      return;
    }

    if (
      userTypedValue &&
      !resolvedItem &&
      normalizeLookupText(editingRow.itemQuery) !== normalizeLookupText(selectedComposite) &&
      normalizeLookupText(editingRow.descriptionQuery) !== normalizeLookupText(selectedItem?.description ?? '')
    ) {
      setErrorMessage('The entered budget item was not found. Select a valid budget item from suggestions before saving.');
      return;
    }

    if (!budgetItemLookup.has(budgetItemId)) {
      setErrorMessage('Select a valid budget item or description from the suggestions before saving.');
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
          budget_item_id: budgetItemId,
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
      setOpenPicker(null);
      setSuccessMessage('Progress update created successfully.');
      return;
    }

    const response = await supabase
      .from('progress_updates')
      .update({
        budget_item_id: budgetItemId,
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
    setOpenPicker(null);
    setSuccessMessage('Progress update saved successfully.');
  }

  async function handleDelete(row: ProgressRecord) {
    if (!supabase) {
      return;
    }

    const meta = getRowItemMeta(row);
    const confirmed = window.confirm(`Delete progress entry for ${meta.code} on ${row.reporting_date}?`);
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
    <div className="flex h-full min-h-0 flex-col gap-6">
      <section className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Progress Tracking</h1>
        <p className="mt-1 text-sm text-slate-500">Manage and update progress entries directly from the table.</p>
      </section>

      <Card className="flex min-h-0 flex-1 flex-col">
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
          <div className="mt-4 min-h-0 flex-1 overflow-auto max-h-[70vh]">
            <table className="min-w-full text-left text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-white">
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
                  <th className="py-2 pr-3">UoM</th>
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
                      <div className="relative">
                        <input
                          className="h-8 w-full rounded-md border border-slate-300 px-2"
                          onChange={(e) => {
                            const query = e.target.value;
                            setEditingRow((c) => (c ? { ...c, itemQuery: query } : c));
                            setOpenPicker('item');
                          }}
                          onFocus={() => setOpenPicker('item')}
                          placeholder="Type code"
                          value={editingRow.itemQuery}
                        />
                        {openPicker === 'item' && matchingCodeItems.length > 0 ? (
                          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {matchingCodeItems.map((item) => (
                              <button
                                className="block w-full px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                                key={`create-code-${item.id}`}
                                onClick={() => handlePickerSelect(item)}
                                type="button"
                              >
                                {item.code} — {item.description}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="relative">
                        <input
                          className="h-8 w-full rounded-md border border-slate-300 px-2"
                          onChange={(e) => {
                            const query = e.target.value;
                            setEditingRow((c) => (c ? { ...c, descriptionQuery: query } : c));
                            setOpenPicker('description');
                          }}
                          onFocus={() => setOpenPicker('description')}
                          placeholder="Type description"
                          value={editingRow.descriptionQuery}
                        />
                        {openPicker === 'description' && matchingDescriptionItems.length > 0 ? (
                          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {matchingDescriptionItems.map((item) => (
                              <button
                                className="block w-full px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                                key={`create-desc-${item.id}`}
                                onClick={() => handlePickerSelect(item)}
                                type="button"
                              >
                                {item.description} ({item.code})
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{budgetItemLookup.get(editingRow.budget_item_id)?.uom ?? '—'}</td>
                    <td className="py-2 pr-3"><input className="h-8 w-24 rounded-md border border-slate-300 px-2" min="0" onChange={(e) => handleInstalledQuantityChange(e.target.value)} step="0.001" type="number" value={editingRow.installed_quantity} /></td>
                    <td className="py-2 pr-3"><input className="h-8 w-24 rounded-md border border-slate-300 px-2" max="100" min="0" onChange={(e) => handlePercentCompleteChange(e.target.value)} step="0.01" type="number" value={editingRow.percent_complete} /></td>
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
                  const rowMeta = getRowItemMeta(row);
                  return (
                    <tr className="border-b border-slate-100" key={row.id}>
                      <td className="py-3 pr-3 text-slate-700">
                        {isEditing ? (
                          <input className="h-8 rounded-md border border-slate-300 px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, reporting_date: e.target.value } : c))} type="date" value={editingRow.reporting_date} />
                        ) : formatReportingDate(row.reporting_date)}
                      </td>
                      <td className="py-3 pr-3 font-medium text-slate-800">
                        {isEditing ? (
                          <div className="relative">
                            <input
                              className="h-8 w-full rounded-md border border-slate-300 px-2"
                              onChange={(e) => {
                                const query = e.target.value;
                                setEditingRow((c) => (c ? { ...c, itemQuery: query } : c));
                                setOpenPicker('item');
                              }}
                              onFocus={() => setOpenPicker('item')}
                              placeholder="Type code"
                              value={editingRow.itemQuery}
                            />
                            {openPicker === 'item' && matchingCodeItems.length > 0 ? (
                              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                                {matchingCodeItems.map((item) => (
                                  <button
                                    className="block w-full px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                                    key={`edit-code-${item.id}`}
                                    onClick={() => handlePickerSelect(item)}
                                    type="button"
                                  >
                                    {item.code} — {item.description}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : rowMeta.code}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {isEditing ? (
                          <div className="relative">
                            <input
                              className="h-8 w-full rounded-md border border-slate-300 px-2"
                              onChange={(e) => {
                                const query = e.target.value;
                                setEditingRow((c) => (c ? { ...c, descriptionQuery: query } : c));
                                setOpenPicker('description');
                              }}
                              onFocus={() => setOpenPicker('description')}
                              placeholder="Type description"
                              value={editingRow.descriptionQuery}
                            />
                            {openPicker === 'description' && matchingDescriptionItems.length > 0 ? (
                              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                                {matchingDescriptionItems.map((item) => (
                                  <button
                                    className="block w-full px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                                    key={`edit-desc-${item.id}`}
                                    onClick={() => handlePickerSelect(item)}
                                    type="button"
                                  >
                                    {item.description} ({item.code})
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : rowMeta.description}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{isEditing ? budgetItemLookup.get(editingRow.budget_item_id)?.uom ?? '—' : rowMeta.uom}</td>
                      <td className="py-3 pr-3 text-slate-700">
                        {isEditing ? (
                          <input className="h-8 w-24 rounded-md border border-slate-300 px-2" min="0" onChange={(e) => handleInstalledQuantityChange(e.target.value)} step="0.001" type="number" value={editingRow.installed_quantity} />
                        ) : row.installed_quantity}
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {isEditing ? (
                          <input className="h-8 w-24 rounded-md border border-slate-300 px-2" max="100" min="0" onChange={(e) => handlePercentCompleteChange(e.target.value)} step="0.01" type="number" value={editingRow.percent_complete} />
                        ) : row.percent_complete ?? '—'}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {isEditing ? (
                          <input className="h-8 w-full rounded-md border border-slate-300 px-2" onChange={(e) => setEditingRow((c) => (c ? { ...c, remarks: e.target.value } : c))} value={editingRow.remarks} />
                        ) : row.remarks ?? '—'}
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
