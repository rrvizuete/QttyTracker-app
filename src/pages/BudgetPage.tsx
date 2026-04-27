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

interface ImportRow {
  code: string;
  description: string;
  quantity: number;
  uom: string;
  rate: number;
  parentCode: string | null;
  kind: LineKind;
}

function toCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function toNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      columns.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  columns.push(current);
  return columns;
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
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uomFilter, setUomFilter] = useState('all');
  const [lineTypeFilter, setLineTypeFilter] = useState<'all' | LineKind>('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [valueSort, setValueSort] = useState<'code-asc' | 'value-desc'>('code-asc');
  const [showImportHelp, setShowImportHelp] = useState(false);
  const editorRowRef = useRef<HTMLTableRowElement | null>(null);
  const editorCodeInputRef = useRef<HTMLInputElement | null>(null);
  const activeEditorKey = editorState ? `${editorState.mode}:${editorState.rowId ?? 'new'}:${editorState.parentId}` : null;

  const budgetRows = useMemo(() => sortByHierarchy(buildRollups(budgetItems)), [budgetItems]);

  const filteredBudgetRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const rows = budgetRows.filter((item) => {
      const matchesText =
        normalizedSearch.length === 0 || item.code.toLowerCase().includes(normalizedSearch) || item.description.toLowerCase().includes(normalizedSearch);
      const matchesLevel = levelFilter === 'all' || item.level === Number(levelFilter);
      const matchesUom = uomFilter === 'all' || item.uom === uomFilter;
      const itemType: LineKind = item.quantity === 0 && item.rate === 0 ? 'section' : 'position';
      const matchesType = lineTypeFilter === 'all' || itemType === lineTypeFilter;
      return matchesText && matchesLevel && matchesUom && matchesType;
    });

    if (valueSort === 'value-desc') {
      return [...rows].sort((a, b) => b.rolledValue - a.rolledValue || a.code.localeCompare(b.code));
    }

    return rows;
  }, [budgetRows, levelFilter, lineTypeFilter, searchTerm, uomFilter, valueSort]);

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
        supabase.from('units_of_measure').select('code,label').order('sort_order', { ascending: true }).order('label'),
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

  async function handleImportCsv(file: File) {
    if (!supabase || !selectedProjectId) {
      setErrorMessage('Select a project before importing.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

      if (lines.length < 2) {
        setErrorMessage('Import file must include a header row and at least one data row.');
        setIsImporting(false);
        return;
      }

      const delimiter = lines[0].includes('	') ? '	' : ',';
      const headers = parseDelimitedLine(lines[0], delimiter).map((value) => value.trim());
      const dataLines = lines.slice(1);

      const parsedRows: ImportRow[] = dataLines.map((line) => {
        const columns = parseDelimitedLine(line, delimiter);
        const normalized = new Map<string, string | number>();
        headers.forEach((header, index) => normalized.set(normalizeHeader(header), columns[index]?.trim() ?? ''));

        const kindRaw = String(normalized.get('kind') ?? '').toLowerCase();
        const kind: LineKind = kindRaw === 'section' ? 'section' : 'position';

        const quantity = Number(normalized.get('quantity') ?? normalized.get('budgetquantity') ?? normalized.get('qty') ?? 0);
        const rate = Number(normalized.get('rate') ?? normalized.get('unitcost') ?? 0);

        return {
          code: String(normalized.get('code') ?? normalized.get('itemcode') ?? '').trim(),
          description: String(normalized.get('description') ?? '').trim(),
          quantity: Number.isFinite(quantity) ? quantity : 0,
          uom: String(normalized.get('uom') ?? normalized.get('unit') ?? '').trim(),
          rate: Number.isFinite(rate) ? rate : 0,
          parentCode: String(normalized.get('parentcode') ?? '').trim() || null,
          kind,
        };
      });

      const validRows = parsedRows.filter((row) => row.code && row.description && row.uom);

      if (validRows.length === 0) {
        setErrorMessage('No valid rows found. Required columns: code, description, uom (plus quantity/rate when needed).');
        setIsImporting(false);
        return;
      }

      const existingByCode = new Map(budgetItems.map((item) => [item.code.toLowerCase(), item]));
      const insertedByCode = new Map<string, { id: string; level: number }>();
      let insertedCount = 0;

      for (const row of validRows) {
        const codeKey = row.code.toLowerCase();
        if (existingByCode.has(codeKey)) {
          continue;
        }

        let parentId: string | null = null;
        let level = 1;
        if (row.parentCode) {
          const parentKey = row.parentCode.toLowerCase();
          const parent = insertedByCode.get(parentKey) ?? (existingByCode.get(parentKey) ? { id: existingByCode.get(parentKey)!.id, level: existingByCode.get(parentKey)!.level } : null);
          if (!parent) {
            continue;
          }
          parentId = parent.id;
          level = parent.level + 1;
        }

        const quantity = row.kind === 'section' ? 0 : Math.max(0, row.quantity);
        const rate = row.kind === 'section' ? 0 : Math.max(0, row.rate);

        const response = await supabase
          .from('budget_items')
          .insert({
            project_id: selectedProjectId,
            parent_id: parentId,
            level,
            code: row.code,
            description: row.description,
            quantity,
            uom: row.uom,
            rate,
            created_by: session.user.id,
          })
          .select('id,level')
          .single();

        if (response.error) {
          setErrorMessage(mapBudgetError(response.error.message));
          setIsImporting(false);
          return;
        }

        insertedByCode.set(codeKey, response.data);
        insertedCount += 1;
      }

      await fetchBudgetItems(selectedProjectId);
      setSuccessMessage(`CSV import completed. ${insertedCount} rows imported.`);
    } catch {
      setErrorMessage('Failed to parse CSV/TSV file. Upload a valid file with a header row.');
    }

    setIsImporting(false);
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
    <div className="flex h-full min-h-0 flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Budget Management</h1>
        <p className="mt-1 text-sm text-slate-500">Manage hierarchy, inline edits, and CSV/TSV imports for budget data.</p>
      </section>

      <Card>
        <label className="flex max-w-sm flex-col gap-2 text-sm font-medium text-slate-700">
          <span>Project</span>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setSelectedProjectId(event.target.value)} value={selectedProjectId}>
            {projects.length === 0 ? <option value="">No projects available</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Budget Hierarchy</h2>
            <p className="text-sm text-slate-500">{filteredBudgetRows.length} shown / {budgetRows.length} total</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <input
                accept=".csv,.txt"
                className="hidden"
                disabled={!selectedProjectId || isImporting}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImportCsv(file);
                  }
                  event.currentTarget.value = '';
                }}
                type="file"
              />
              <span className="inline-flex rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {isImporting ? 'Importing…' : 'Import CSV'}
              </span>
            </label>
            <Button onClick={() => setShowImportHelp(true)} type="button" variant="ghost">
              CSV format help
            </Button>
            <a
              className="inline-flex rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              download="budget-import-template.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent('code,description,quantity,uom,rate,parentCode,kind\nA-100,Site setup,0,LS,0,,section\nA-110,Temporary fencing,120,LF,45,A-100,position')}`}
            >
              Download template
            </a>
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

        {!isLoading && filteredBudgetRows.length > 0 ? (
          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>Code</p>
                      <input className="h-7 w-full rounded border border-slate-300 px-2 text-xs normal-case" onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search" value={searchTerm} />
                    </div>
                  </th><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>Qty</p>
                      <select className="h-7 w-full rounded border border-slate-300 bg-white px-1 text-xs normal-case" onChange={(e) => setLineTypeFilter(e.target.value as 'all' | LineKind)} value={lineTypeFilter}>
                        <option value="all">All types</option>
                        <option value="section">Sections</option>
                        <option value="position">Positions</option>
                      </select>
                    </div>
                  </th><th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>UoM</p>
                      <select className="h-7 w-full rounded border border-slate-300 bg-white px-1 text-xs normal-case" onChange={(e) => setUomFilter(e.target.value)} value={uomFilter}>
                        <option value="all">All</option>
                        {units.map((unit) => (
                          <option key={unit.code} value={unit.code}>
                            {unit.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th><th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>Rate</p>
                      <select className="h-7 w-full rounded border border-slate-300 bg-white px-1 text-xs normal-case" onChange={(e) => setLevelFilter(e.target.value)} value={levelFilter}>
                        <option value="all">All lvls</option>
                        {Array.from({ length: 8 }, (_, index) => index + 1).map((level) => (
                          <option key={level} value={String(level)}>
                            L{level}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th><th className="py-2 pr-3">Line Value</th><th className="py-2 pr-3">Rolled Qty</th><th className="py-2 pr-3">
                    <div className="space-y-1">
                      <p>Rolled Value</p>
                      <select className="h-7 w-full rounded border border-slate-300 bg-white px-1 text-xs normal-case" onChange={(e) => setValueSort(e.target.value as 'code-asc' | 'value-desc')} value={valueSort}>
                        <option value="code-asc">Code</option>
                        <option value="value-desc">Top value</option>
                      </select>
                    </div>
                  </th><th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {editorState?.mode === 'create' && editorState.parentId === '' ? renderInlineEditorRow('new-root-inline-row') : null}
                {filteredBudgetRows.map((item) => (
                  <Fragment key={item.id}>
                    {editorState?.mode === 'edit' && editorState.rowId === item.id ? (
                      renderInlineEditorRow(`edit-inline-row-${item.id}`)
                    ) : (
                      <tr className="border-b border-slate-100" key={item.id}>
                        <td className="py-3 pr-3 font-medium text-slate-800">{item.code}</td>
                        <td className="py-3 pr-3 text-slate-600" style={{ paddingLeft: `${(item.level - 1) * 24 + 4}px` }}>{item.description}</td>
                        <td className="py-3 pr-3 text-slate-600">{toNumber(item.quantity)}</td>
                        <td className="py-3 pr-3 text-slate-600">{item.uom}</td>
                        <td className="py-3 pr-3 text-slate-600">{toCurrency(item.rate)}</td>
                        <td className="py-3 pr-3 text-slate-700">{toCurrency(item.item_value)}</td>
                        <td className="py-3 pr-3 text-slate-700">{toNumber(item.rolledQuantity)}</td>
                        <td className="py-3 pr-3 font-semibold text-brand-600">{toCurrency(item.rolledValue)}</td>
                        <td className="py-3 whitespace-nowrap">
                          <div className="flex flex-nowrap items-center gap-1">
                            <Button className="shrink-0 px-2 py-1 text-xs" onClick={() => startEdit(item)} type="button" variant="ghost">Edit</Button>
                            <Button className="shrink-0 px-2 py-1 text-xs" disabled={item.level >= 8} onClick={() => startCreate('section', item.id)} type="button" variant="secondary">+ Section</Button>
                            <Button className="shrink-0 px-2 py-1 text-xs" disabled={item.level >= 8} onClick={() => startCreate('position', item.id)} type="button">+ Position</Button>
                            <Button className="shrink-0 px-2 py-1 text-xs" disabled={deletingItemId === item.id} onClick={() => handleDelete(item)} type="button" variant="danger">{deletingItemId === item.id ? 'Deleting…' : 'Delete'}</Button>
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

      {showImportHelp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">CSV/TSV import structure</h3>
            <p className="mt-2 text-sm text-slate-600">Required columns: <strong>code</strong>, <strong>description</strong>, <strong>uom</strong>. Optional: quantity, rate, parentCode, kind.</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li><strong>kind</strong>: section or position (default: position).</li>
              <li><strong>parentCode</strong>: sets hierarchy parent by existing/imported code.</li>
              <li>Sections are forced to quantity=0 and rate=0.</li>
            </ul>
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              code,description,quantity,uom,rate,parentCode,kind<br/>A-100,Site setup,0,LS,0,,section<br/>A-110,Temporary fencing,120,LF,45,A-100,position
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setShowImportHelp(false)} type="button">Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
