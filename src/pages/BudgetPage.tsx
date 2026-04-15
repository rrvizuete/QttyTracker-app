import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';

interface BudgetPageProps {
  session: Session;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface UnitOption {
  code: string;
  label: string;
}

interface BudgetItemRecord {
  id: string;
  project_id: string;
  parent_id: string | null;
  code: string;
  description: string;
  level: number;
  quantity: number;
  uom: string;
  rate: number;
  item_value: number;
}

interface RollupRow extends BudgetItemRecord {
  rolledQuantity: number;
  rolledValue: number;
}

type EditorMode = 'create' | 'edit';
type LineKind = 'position' | 'section';

interface EditorState {
  projectId: string;
  mode: EditorMode;
  kind: LineKind;
  rowId: string | null;
  parentId: string;
  level: number;
  code: string;
  description: string;
  quantity: string;
  uom: string;
  rate: string;
}

function toCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function toNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function mapBudgetError(message: string): string {
  if (message.includes('public.budget_items') && message.includes('schema cache')) {
    return 'Budget items table is missing in Supabase. Run supabase migrations, then refresh.';
  }

  if (message.includes('public.units_of_measure') && message.includes('schema cache')) {
    return 'Units of measure table is missing in Supabase. Run the new units migration, then refresh.';
  }

  if (message.includes('Budget hierarchy supports up to 8 levels')) {
    return 'Budget hierarchy supports up to 8 levels only. Select a parent that is level 7 or above.';
  }

  if (message.toLowerCase().includes('row-level security')) {
    return 'Budget write failed due to permissions. Ensure your user is a project admin (or global admin).';
  }

  return message;
}

function buildRollups(items: BudgetItemRecord[]): RollupRow[] {
  const byId = new Map<string, BudgetItemRecord>();
  const childrenByParent = new Map<string, BudgetItemRecord[]>();

  items.forEach((item) => {
    byId.set(item.id, item);

    if (!item.parent_id) {
      return;
    }

    const list = childrenByParent.get(item.parent_id) ?? [];
    list.push(item);
    childrenByParent.set(item.parent_id, list);
  });

  const memo = new Map<string, { quantity: number; value: number }>();

  function aggregate(itemId: string): { quantity: number; value: number } {
    const existing = memo.get(itemId);
    if (existing) {
      return existing;
    }

    const item = byId.get(itemId);
    if (!item) {
      return { quantity: 0, value: 0 };
    }

    const children = childrenByParent.get(itemId) ?? [];
    const childrenTotals = children.reduce(
      (accumulator, child) => {
        const childTotals = aggregate(child.id);
        return {
          quantity: accumulator.quantity + childTotals.quantity,
          value: accumulator.value + childTotals.value,
        };
      },
      { quantity: 0, value: 0 },
    );

    const totals = {
      quantity: item.quantity + childrenTotals.quantity,
      value: item.item_value + childrenTotals.value,
    };

    memo.set(itemId, totals);
    return totals;
  }

  return items.map((item) => {
    const totals = aggregate(item.id);

    return {
      ...item,
      rolledQuantity: totals.quantity,
      rolledValue: totals.value,
    };
  });
}

function sortByHierarchy(items: RollupRow[]): RollupRow[] {
  const roots = items.filter((item) => !item.parent_id).sort((a, b) => a.code.localeCompare(b.code));
  const childrenByParent = new Map<string, RollupRow[]>();

  items.forEach((item) => {
    if (!item.parent_id) {
      return;
    }

    const list = childrenByParent.get(item.parent_id) ?? [];
    list.push(item);
    childrenByParent.set(item.parent_id, list);
  });

  for (const [key, children] of childrenByParent.entries()) {
    childrenByParent.set(
      key,
      [...children].sort((a, b) => a.code.localeCompare(b.code)),
    );
  }

  const ordered: RollupRow[] = [];

  function visit(node: RollupRow) {
    ordered.push(node);

    const children = childrenByParent.get(node.id) ?? [];
    children.forEach((child) => visit(child));
  }

  roots.forEach((root) => visit(root));
  return ordered;
}

function makeEditorState(params: {
  projectId: string;
  mode: EditorMode;
  kind: LineKind;
  rowId?: string | null;
  parentId?: string;
  level?: number;
  code?: string;
  description?: string;
  quantity?: string;
  uom?: string;
  rate?: string;
}): EditorState {
  const {
    projectId,
    mode,
    kind,
    rowId = null,
    parentId = '',
    level = 1,
    code = '',
    description = '',
    quantity = kind === 'section' ? '0' : '',
    uom = '',
    rate = kind === 'section' ? '0' : '',
  } = params;

  return {
    projectId,
    mode,
    kind,
    rowId,
    parentId,
    level,
    code,
    description,
    quantity,
    uom,
    rate,
  };
}

export function BudgetPage({ session }: BudgetPageProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [budgetItems, setBudgetItems] = useState<BudgetItemRecord[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const editorRowRef = useRef<HTMLTableRowElement | null>(null);
  const editorCodeInputRef = useRef<HTMLInputElement | null>(null);
  const activeEditorKey = editorState ? `${editorState.mode}:${editorState.rowId ?? 'new'}:${editorState.parentId}` : null;

  const budgetRows = useMemo(() => {
    const rolled = buildRollups(budgetItems);
    return sortByHierarchy(rolled);
  }, [budgetItems]);

  useEffect(() => {
    let isActive = true;

    async function bootstrapBudget() {
      if (!supabase) {
        if (isActive) {
          setIsLoading(false);
          setErrorMessage('Supabase environment variables are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      const [projectsResponse, unitsResponse] = await Promise.all([
        supabase.from('projects').select('id,name').order('name'),
        supabase.from('units_of_measure').select('code,label').order('label'),
      ]);

      if (!isActive) {
        return;
      }

      if (projectsResponse.error) {
        setErrorMessage(mapBudgetError(projectsResponse.error.message));
        setProjects([]);
        setIsLoading(false);
        return;
      }

      if (unitsResponse.error) {
        setErrorMessage(mapBudgetError(unitsResponse.error.message));
        setUnits([]);
        setIsLoading(false);
        return;
      }

      const projectRows = projectsResponse.data ?? [];
      setProjects(projectRows);
      setUnits(unitsResponse.data ?? []);

      if (projectRows.length > 0) {
        setSelectedProjectId((current) => current || projectRows[0].id);
      }

      setIsLoading(false);
    }

    void bootstrapBudget();

    return () => {
      isActive = false;
    };
  }, [session.user.id]);

  async function fetchBudgetItems(projectId: string) {
    if (!supabase || !projectId) {
      setBudgetItems([]);
      setEditorState(null);
      return;
    }

    setErrorMessage(null);

    const response = await supabase
      .from('budget_items')
      .select('id,project_id,parent_id,code,description,level,quantity,uom,rate,item_value')
      .eq('project_id', projectId)
      .order('level')
      .order('code');

    if (response.error) {
      setBudgetItems([]);
      setErrorMessage(mapBudgetError(response.error.message));
      return;
    }

    setBudgetItems(response.data ?? []);
    setEditorState(null);
  }

  useEffect(() => {
    void fetchBudgetItems(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!activeEditorKey) {
      return;
    }

    editorRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    editorCodeInputRef.current?.focus();
  }, [activeEditorKey]);

  function startCreate(kind: LineKind, parentId: string | null) {
    const parent = parentId ? budgetItems.find((item) => item.id === parentId) : null;
    const level = parent ? Math.min(parent.level + 1, 8) : 1;

    if (level > 8) {
      setErrorMessage('Budget hierarchy supports up to 8 levels only.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setEditorState(
      makeEditorState({
        projectId: selectedProjectId,
        mode: 'create',
        kind,
        parentId: parentId ?? '',
        level,
        uom: units[0]?.code ?? '',
      }),
    );
  }

  function startEdit(item: BudgetItemRecord) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditorState(
      makeEditorState({
        mode: 'edit',
        projectId: item.project_id,
        kind: item.quantity === 0 && item.rate === 0 ? 'section' : 'position',
        rowId: item.id,
        parentId: item.parent_id ?? '',
        level: item.level,
        code: item.code,
        description: item.description,
        quantity: String(item.quantity),
        uom: item.uom,
        rate: String(item.rate),
      }),
    );
  }

  async function saveEditor() {
    if (!supabase || !editorState) {
      return;
    }

    if (!selectedProjectId) {
      setErrorMessage('Select a project before saving budget lines.');
      return;
    }

    if (!editorState.code.trim() || !editorState.description.trim() || !editorState.uom.trim()) {
      setErrorMessage('Code, description, and UoM are required.');
      return;
    }

    if (editorState.projectId !== selectedProjectId) {
      setErrorMessage('This line belongs to a different project. Re-open it from the currently selected project before saving.');
      setEditorState(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const quantity = Number(editorState.quantity || '0');
    const rate = Number(editorState.rate || '0');

    if (Number.isNaN(quantity) || Number.isNaN(rate) || quantity < 0 || rate < 0) {
      setIsSaving(false);
      setErrorMessage('Quantity and rate must be valid numbers equal to or above zero.');
      return;
    }

    if (editorState.mode === 'create') {
      const insertResponse = await supabase
        .from('budget_items')
        .insert({
          project_id: selectedProjectId,
          parent_id: editorState.parentId || null,
          level: editorState.level,
          code: editorState.code.trim(),
          description: editorState.description.trim(),
          quantity,
          uom: editorState.uom,
          rate,
          created_by: session.user.id,
        })
        .select('id,project_id,parent_id,code,description,level,quantity,uom,rate,item_value')
        .single();

      setIsSaving(false);

      if (insertResponse.error) {
        setErrorMessage(mapBudgetError(insertResponse.error.message));
        return;
      }

      setBudgetItems((current) => [...current, insertResponse.data]);
      setEditorState(null);
      setSuccessMessage(`${editorState.kind === 'section' ? 'Section' : 'Position'} created successfully.`);
      return;
    }

    const updateResponse = await supabase
      .from('budget_items')
      .update({
        code: editorState.code.trim(),
        description: editorState.description.trim(),
        quantity,
        uom: editorState.uom,
        rate,
      })
      .eq('id', editorState.rowId)
      .eq('project_id', selectedProjectId)
      .select('id,project_id,parent_id,code,description,level,quantity,uom,rate,item_value')
      .single();

    setIsSaving(false);

    if (updateResponse.error) {
      setErrorMessage(mapBudgetError(updateResponse.error.message));
      return;
    }

    setBudgetItems((current) => current.map((item) => (item.id === updateResponse.data.id ? updateResponse.data : item)));
    setEditorState(null);
    setSuccessMessage('Budget line updated successfully.');
  }

  async function handleDelete(item: BudgetItemRecord) {
    if (!supabase) {
      return;
    }

    const confirmation = window.confirm(`Delete "${item.code} - ${item.description}" and all nested lines?`);
    if (!confirmation) {
      return;
    }

    setDeletingItemId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await supabase.from('budget_items').delete().eq('id', item.id);

    setDeletingItemId(null);

    if (response.error) {
      setErrorMessage(mapBudgetError(response.error.message));
      return;
    }

    await fetchBudgetItems(selectedProjectId);
    setSuccessMessage('Budget line deleted successfully.');
  }

  function renderInlineEditorRow(rowKey: string) {
    if (!editorState) {
      return null;
    }

    return (
      <tr className="border-b border-brand-100 bg-brand-50/70" key={rowKey} ref={editorRowRef}>
        <td className="py-1.5 pr-3 align-middle">
          <input
            className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            ref={editorCodeInputRef}
            onChange={(event) => setEditorState((current) => (current ? { ...current, code: event.target.value } : current))}
            placeholder="Code"
            value={editorState.code}
          />
        </td>
        <td className="py-1.5 pr-3 align-middle" style={{ paddingLeft: `${(editorState.level - 1) * 24 + 4}px` }}>
          <input
            className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            onChange={(event) => setEditorState((current) => (current ? { ...current, description: event.target.value } : current))}
            placeholder="Description"
            value={editorState.description}
          />
        </td>
        <td className="py-1.5 pr-3 align-middle">
          <input
            className="h-8 w-24 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            min="0"
            onChange={(event) => setEditorState((current) => (current ? { ...current, quantity: event.target.value } : current))}
            step="0.001"
            type="number"
            value={editorState.quantity}
          />
        </td>
        <td className="py-1.5 pr-3 align-middle">
          <select
            className="h-8 w-36 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            onChange={(event) => setEditorState((current) => (current ? { ...current, uom: event.target.value } : current))}
            value={editorState.uom}
          >
            <option value="">Select unit</option>
            {units.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.label}
              </option>
            ))}
          </select>
        </td>
        <td className="py-1.5 pr-3 align-middle">
          <input
            className="h-8 w-24 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            min="0"
            onChange={(event) => setEditorState((current) => (current ? { ...current, rate: event.target.value } : current))}
            step="0.01"
            type="number"
            value={editorState.rate}
          />
        </td>
        <td className="py-1.5 pr-3 text-sm text-slate-500">—</td>
        <td className="py-1.5 pr-3 text-sm text-slate-500">—</td>
        <td className="py-1.5 pr-3 text-sm text-slate-500">—</td>
        <td className="py-1.5 align-middle whitespace-nowrap">
          <div className="flex flex-nowrap items-center gap-1">
            <Button className="shrink-0 px-2 py-1 text-xs" disabled={isSaving} onClick={saveEditor} type="button">
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button className="shrink-0 px-2 py-1 text-xs" onClick={() => setEditorState(null)} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Phase 3: Budget Loading</h1>
        <p className="mt-1 text-sm text-slate-500">Build and edit your budget hierarchy directly in the table.</p>
      </section>

      <Card>
        <label className="flex max-w-sm flex-col gap-2 text-sm font-medium text-slate-700">
          <span>Project</span>
          <select
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            onChange={(event) => setSelectedProjectId(event.target.value)}
            value={selectedProjectId}
          >
            {projects.length === 0 ? <option value="">No projects available</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Budget Hierarchy</h2>
            <p className="text-sm text-slate-500">{budgetRows.length} lines</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!selectedProjectId || isSaving} onClick={() => startCreate('section', null)} type="button" variant="secondary">
              Add Section
            </Button>
            <Button disabled={!selectedProjectId || isSaving} onClick={() => startCreate('position', null)} type="button">
              Add Position
            </Button>
          </div>
        </div>

        {errorMessage ? <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
        {successMessage ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}

        {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading budget module…</p> : null}

        {!isLoading && budgetRows.length === 0 && !(editorState?.mode === 'create' && editorState.parentId === '') ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No budget entries yet. Add a section or position, then use row buttons to add nested levels.
          </p>
        ) : null}

        {!isLoading && (budgetRows.length > 0 || (editorState?.mode === 'create' && editorState.parentId === '')) ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">UoM</th>
                  <th className="py-2 pr-3">Rate</th>
                  <th className="py-2 pr-3">Line Value</th>
                  <th className="py-2 pr-3">Rolled Qty</th>
                  <th className="py-2 pr-3">Rolled Value</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {editorState?.mode === 'create' && editorState.parentId === '' ? renderInlineEditorRow('new-root-inline-row') : null}
                {budgetRows.map((item) => (
                  <Fragment key={item.id}>
                    {editorState?.mode === 'edit' && editorState.rowId === item.id ? (
                      renderInlineEditorRow(`edit-inline-row-${item.id}`)
                    ) : (
                      <tr className="border-b border-slate-100" key={item.id}>
                        <td className="py-3 pr-3 font-medium text-slate-800">{item.code}</td>
                        <td className="py-3 pr-3 text-slate-600" style={{ paddingLeft: `${(item.level - 1) * 24 + 4}px` }}>
                          {item.description}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">{toNumber(item.quantity)}</td>
                        <td className="py-3 pr-3 text-slate-600">{item.uom}</td>
                        <td className="py-3 pr-3 text-slate-600">{toCurrency(item.rate)}</td>
                        <td className="py-3 pr-3 text-slate-700">{toCurrency(item.item_value)}</td>
                        <td className="py-3 pr-3 text-slate-700">{toNumber(item.rolledQuantity)}</td>
                        <td className="py-3 pr-3 font-semibold text-brand-600">{toCurrency(item.rolledValue)}</td>
                        <td className="py-3 whitespace-nowrap">
                          <div className="flex flex-nowrap items-center gap-1">
                            <Button onClick={() => startEdit(item)} className="shrink-0 px-2 py-1 text-xs" type="button" variant="ghost">
                              Edit
                            </Button>
                            <Button
                              disabled={item.level >= 8}
                              onClick={() => startCreate('section', item.id)}
                              className="shrink-0 px-2 py-1 text-xs"
                              type="button"
                              variant="secondary"
                            >
                              + Section
                            </Button>
                            <Button
                              disabled={item.level >= 8}
                              onClick={() => startCreate('position', item.id)}
                              className="shrink-0 px-2 py-1 text-xs"
                              type="button"
                            >
                              + Position
                            </Button>
                            <Button
                              className="shrink-0 px-2 py-1 text-xs"
                              disabled={deletingItemId === item.id}
                              onClick={() => handleDelete(item)}
                              type="button"
                              variant="danger"
                            >
                              {deletingItemId === item.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {editorState?.mode === 'create' && editorState.parentId === item.id ? renderInlineEditorRow(`new-inline-row-${item.id}`) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
