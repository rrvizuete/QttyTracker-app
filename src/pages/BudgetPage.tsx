import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';

interface BudgetPageProps {
  session: Session;
}

interface ProjectOption {
  id: string;
  name: string;
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

interface BudgetFormState {
  code: string;
  description: string;
  quantity: string;
  uom: string;
  rate: string;
  parentId: string;
}

interface RollupRow extends BudgetItemRecord {
  rolledQuantity: number;
  rolledValue: number;
}

const levelIndentClass: Record<number, string> = {
  1: 'pl-1',
  2: 'pl-2',
  3: 'pl-4',
  4: 'pl-6',
  5: 'pl-8',
  6: 'pl-10',
  7: 'pl-12',
  8: 'pl-14',
};

const initialFormState: BudgetFormState = {
  code: '',
  description: '',
  quantity: '',
  uom: '',
  rate: '',
  parentId: '',
};

function toCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function toNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function mapBudgetError(message: string): string {
  if (message.includes('public.budget_items') && message.includes('schema cache')) {
    return 'Budget items table is missing in Supabase. Run supabase/migrations/20260414_create_budget_items.sql in the SQL editor, then refresh.';
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

export function BudgetPage({ session }: BudgetPageProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [budgetItems, setBudgetItems] = useState<BudgetItemRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<BudgetFormState>(initialFormState);

  const availableParents = useMemo(
    () => budgetItems.filter((item) => item.level < 8).sort((a, b) => a.level - b.level || a.code.localeCompare(b.code)),
    [budgetItems],
  );

  const budgetRows = useMemo(() => {
    const rolled = buildRollups(budgetItems);
    return [...rolled].sort((a, b) => a.code.localeCompare(b.code));
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

      const projectsResponse = await supabase.from('projects').select('id,name').order('name');

      if (!isActive) {
        return;
      }

      if (projectsResponse.error) {
        setErrorMessage(mapBudgetError(projectsResponse.error.message));
        setProjects([]);
        setIsLoading(false);
        return;
      }

      const projectRows = projectsResponse.data ?? [];
      setProjects(projectRows);

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

  useEffect(() => {
    let isActive = true;

    async function loadBudgetItems() {
      if (!supabase || !selectedProjectId) {
        setBudgetItems([]);
        return;
      }

      setErrorMessage(null);

      const response = await supabase
        .from('budget_items')
        .select('id,project_id,parent_id,code,description,level,quantity,uom,rate,item_value')
        .eq('project_id', selectedProjectId)
        .order('level')
        .order('code');

      if (!isActive) {
        return;
      }

      if (response.error) {
        setBudgetItems([]);
        setErrorMessage(mapBudgetError(response.error.message));
        return;
      }

      setBudgetItems(response.data ?? []);
    }

    void loadBudgetItems();

    return () => {
      isActive = false;
    };
  }, [selectedProjectId]);

  async function handleCreateBudgetItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setErrorMessage('Supabase client is unavailable. Check your environment configuration.');
      return;
    }

    if (!selectedProjectId) {
      setErrorMessage('Select a project before adding budget lines.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const parent = budgetItems.find((item) => item.id === formState.parentId);
    const calculatedLevel = parent ? parent.level + 1 : 1;

    const response = await supabase
      .from('budget_items')
      .insert({
        project_id: selectedProjectId,
        parent_id: formState.parentId || null,
        level: calculatedLevel,
        code: formState.code.trim(),
        description: formState.description.trim(),
        quantity: Number(formState.quantity || '0'),
        uom: formState.uom.trim(),
        rate: Number(formState.rate || '0'),
        created_by: session.user.id,
      })
      .select('id,project_id,parent_id,code,description,level,quantity,uom,rate,item_value')
      .single();

    setIsSubmitting(false);

    if (response.error) {
      setErrorMessage(mapBudgetError(response.error.message));
      return;
    }

    setBudgetItems((current) => [...current, response.data]);
    setFormState(initialFormState);
    setSuccessMessage('Budget line created successfully.');
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Phase 3: Budget Loading</h1>
        <p className="mt-1 text-sm text-slate-500">Load and structure project budget data with hierarchy support up to 8 levels.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Add Budget Entry</h2>
          <p className="mt-1 text-sm text-slate-500">Each line includes quantity, unit, rate, and value. Parent totals roll up from descendants.</p>

          <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-slate-700">
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

          <form className="mt-4 space-y-4" onSubmit={handleCreateBudgetItem}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <span>Parent (optional)</span>
              <select
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setFormState((current) => ({ ...current, parentId: event.target.value }))}
                value={formState.parentId}
              >
                <option value="">Top-level (level 1)</option>
                {availableParents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${'—'.repeat(item.level)} ${item.code} (${item.description})`}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="Code"
              onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value }))}
              placeholder="e.g. 03-100"
              required
              value={formState.code}
            />
            <Input
              label="Description"
              onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
              placeholder="Concrete slab"
              required
              value={formState.description}
            />
            <Input
              label="Quantity"
              min="0"
              onChange={(event) => setFormState((current) => ({ ...current, quantity: event.target.value }))}
              placeholder="0"
              required
              step="0.001"
              type="number"
              value={formState.quantity}
            />
            <Input
              label="Unit of Measure (UoM)"
              onChange={(event) => setFormState((current) => ({ ...current, uom: event.target.value }))}
              placeholder="m3, m2, no, kg..."
              required
              value={formState.uom}
            />
            <Input
              label="Rate"
              min="0"
              onChange={(event) => setFormState((current) => ({ ...current, rate: event.target.value }))}
              placeholder="0"
              required
              step="0.01"
              type="number"
              value={formState.rate}
            />
            <Button className="w-full" disabled={isSubmitting || !selectedProjectId} type="submit">
              {isSubmitting ? 'Saving…' : 'Add Budget Line'}
            </Button>
          </form>

          {errorMessage ? <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Budget Hierarchy</h2>
            <p className="text-sm text-slate-500">{budgetRows.length} lines</p>
          </div>

          {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading budget module…</p> : null}

          {!isLoading && budgetRows.length === 0 ? (
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No budget entries yet. Add top-level lines first, then add child lines to build up to level 8.
            </p>
          ) : null}

          {!isLoading && budgetRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Level</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">UoM</th>
                    <th className="py-2 pr-3">Rate</th>
                    <th className="py-2 pr-3">Line Value</th>
                    <th className="py-2 pr-3">Rolled Qty</th>
                    <th className="py-2">Rolled Value</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetRows.map((item) => (
                    <tr className="border-b border-slate-100" key={item.id}>
                      <td className="py-3 pr-3 font-medium text-slate-800">{item.code}</td>
                      <td className={`py-3 pr-3 text-slate-600 ${levelIndentClass[item.level]}`}>{item.description}</td>
                      <td className="py-3 pr-3 text-slate-600">L{item.level}</td>
                      <td className="py-3 pr-3 text-slate-600">{toNumber(item.quantity)}</td>
                      <td className="py-3 pr-3 text-slate-600">{item.uom}</td>
                      <td className="py-3 pr-3 text-slate-600">{toCurrency(item.rate)}</td>
                      <td className="py-3 pr-3 text-slate-700">{toCurrency(item.item_value)}</td>
                      <td className="py-3 pr-3 text-slate-700">{toNumber(item.rolledQuantity)}</td>
                      <td className="py-3 font-semibold text-brand-600">{toCurrency(item.rolledValue)}</td>
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
