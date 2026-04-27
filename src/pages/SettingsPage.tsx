import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';

interface SettingsPageProps {
  session: Session;
}

interface UnitRecord {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

interface UnitFormState {
  code: string;
  label: string;
  sortOrder: string;
  isActive: boolean;
}

interface EditingUnitState extends UnitFormState {
  originalCode: string;
}

const initialUnitForm: UnitFormState = {
  code: '',
  label: '',
  sortOrder: '0',
  isActive: true,
};

function mapSettingsError(message: string): string {
  if (message.includes('public.units_of_measure') && message.includes('schema cache')) {
    return 'Units of measure table is missing in Supabase. Run migrations, then refresh.';
  }

  if (message.toLowerCase().includes('row-level security')) {
    return 'Unit update was blocked by RLS. Confirm your user has permissions to edit settings.';
  }

  if (message.toLowerCase().includes('foreign key')) {
    return 'This UoM is used by budget or progress data and cannot be deleted.';
  }

  return message;
}

export function SettingsPage({ session }: SettingsPageProps) {
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<UnitFormState>(initialUnitForm);
  const [editingUnit, setEditingUnit] = useState<EditingUnitState | null>(null);

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    [units],
  );

  useEffect(() => {
    let isActive = true;

    async function loadUnits() {
      if (!supabase) {
        if (isActive) {
          setIsLoading(false);
          setErrorMessage('Supabase environment variables are missing. Add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values to continue.');
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      const response = await supabase
        .from('units_of_measure')
        .select('code,label,sort_order,is_active')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });

      if (!isActive) {
        return;
      }

      if (response.error) {
        setErrorMessage(mapSettingsError(response.error.message));
        setUnits([]);
      } else {
        setUnits(response.data ?? []);
      }

      setIsLoading(false);
    }

    void loadUnits();

    return () => {
      isActive = false;
    };
  }, [session.user.id]);

  async function handleAddUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    const code = formState.code.trim().toUpperCase();
    const label = formState.label.trim();
    const sortOrder = Number(formState.sortOrder);

    if (!code || !label || Number.isNaN(sortOrder)) {
      setErrorMessage('Code, label, and sort order are required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await supabase
      .from('units_of_measure')
      .insert({
        code,
        label,
        sort_order: sortOrder,
        is_active: formState.isActive,
      })
      .select('code,label,sort_order,is_active')
      .single();

    setIsSubmitting(false);

    if (response.error) {
      setErrorMessage(mapSettingsError(response.error.message));
      return;
    }

    setUnits((current) => [...current, response.data]);
    setFormState(initialUnitForm);
    setSuccessMessage(`Unit ${code} created successfully.`);
  }

  async function handleSaveEdit() {
    if (!supabase || !editingUnit) {
      return;
    }

    const code = editingUnit.code.trim().toUpperCase();
    const label = editingUnit.label.trim();
    const sortOrder = Number(editingUnit.sortOrder);

    if (!code || !label || Number.isNaN(sortOrder)) {
      setErrorMessage('Code, label, and sort order are required.');
      return;
    }

    setSavingCode(code);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await supabase
      .from('units_of_measure')
      .update({
        code,
        label,
        sort_order: sortOrder,
        is_active: editingUnit.isActive,
      })
      .eq('code', editingUnit.originalCode)
      .select('code,label,sort_order,is_active')
      .single();

    if (!response.error && code !== editingUnit.originalCode) {
      const remapResponse = await supabase
        .from('budget_items')
        .update({ uom: code })
        .eq('uom', editingUnit.originalCode);

      if (remapResponse.error) {
        setSavingCode(null);
        setErrorMessage(`UoM code was updated, but Budget remap failed: ${mapSettingsError(remapResponse.error.message)}`);
        return;
      }
    }

    setSavingCode(null);

    if (response.error) {
      setErrorMessage(mapSettingsError(response.error.message));
      return;
    }

    setUnits((current) =>
      current.map((unit) => (unit.code === editingUnit.originalCode ? response.data : unit)),
    );
    setEditingUnit(null);
    setSuccessMessage(`Unit ${editingUnit.originalCode} updated to ${response.data.code}.`);
  }

  async function handleDeleteUnit(unit: UnitRecord) {
    if (!supabase) {
      return;
    }

    const confirmation = window.confirm(`Delete unit "${unit.code}" (${unit.label})?`);
    if (!confirmation) {
      return;
    }

    setDeletingCode(unit.code);
    setErrorMessage(null);
    setSuccessMessage(null);

    const usageResponse = await supabase
      .from('budget_items')
      .select('id', { count: 'exact', head: true })
      .eq('uom', unit.code);

    if (usageResponse.error) {
      setDeletingCode(null);
      setErrorMessage(mapSettingsError(usageResponse.error.message));
      return;
    }

    const usageCount = usageResponse.count ?? 0;
    if (usageCount > 0) {
      setDeletingCode(null);
      setErrorMessage(`Unit ${unit.code} is used in ${usageCount} budget item(s). Remap those entries before deleting this UoM.`);
      return;
    }

    const response = await supabase.from('units_of_measure').delete().eq('code', unit.code);

    setDeletingCode(null);

    if (response.error) {
      setErrorMessage(mapSettingsError(response.error.message));
      return;
    }

    setUnits((current) => current.filter((item) => item.code !== unit.code));
    setSuccessMessage(`Unit ${unit.code} deleted successfully.`);
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage the Unit of Measure (UoM) database used in Budget and Progress modules.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Add Unit</h2>
          <p className="mt-1 text-sm text-slate-500">Create Imperial units such as CF, CY, SF, SY, TON, LF, AC, and EA.</p>

          <form className="mt-4 space-y-4" onSubmit={handleAddUnit}>
            <Input
              label="Code"
              maxLength={12}
              onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              placeholder="e.g. CY"
              required
              value={formState.code}
            />
            <Input
              label="Label"
              maxLength={80}
              onChange={(event) => setFormState((current) => ({ ...current, label: event.target.value }))}
              placeholder="Cubic Yard"
              required
              value={formState.label}
            />
            <Input
              label="Sort Order"
              min={0}
              onChange={(event) => setFormState((current) => ({ ...current, sortOrder: event.target.value }))}
              required
              step="1"
              type="number"
              value={formState.sortOrder}
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={formState.isActive}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                onChange={(event) => setFormState((current) => ({ ...current, isActive: event.target.checked }))}
                type="checkbox"
              />
              Active
            </label>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving…' : 'Add Unit'}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">UoM Database</h2>
            <p className="text-xs text-slate-500">Editable by authorized users</p>
          </div>

          {errorMessage ? <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}

          {isLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading units…</p>
          ) : sortedUnits.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">No units defined yet. Add one to start building your UoM catalog.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Code</th>
                    <th className="px-3 py-2 text-left font-semibold">Label</th>
                    <th className="px-3 py-2 text-left font-semibold">Sort</th>
                    <th className="px-3 py-2 text-left font-semibold">Active</th>
                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedUnits.map((unit) => {
                    const isEditing = editingUnit?.originalCode === unit.code;

                    return (
                      <tr key={unit.code} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-semibold text-slate-800">
                          {isEditing ? (
                            <input
                              className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
                              maxLength={12}
                              onChange={(event) =>
                                setEditingUnit((current) =>
                                  current ? { ...current, code: event.target.value.toUpperCase() } : current,
                                )
                              }
                              value={editingUnit.code}
                            />
                          ) : (
                            unit.code
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {isEditing ? (
                            <input
                              className="h-8 w-full rounded border border-slate-300 px-2 text-sm"
                              onChange={(event) => setEditingUnit((current) => (current ? { ...current, label: event.target.value } : current))}
                              value={editingUnit.label}
                            />
                          ) : (
                            unit.label
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {isEditing ? (
                            <input
                              className="h-8 w-20 rounded border border-slate-300 px-2 text-sm"
                              min={0}
                              onChange={(event) => setEditingUnit((current) => (current ? { ...current, sortOrder: event.target.value } : current))}
                              type="number"
                              value={editingUnit.sortOrder}
                            />
                          ) : (
                            unit.sort_order
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {isEditing ? (
                            <input
                              checked={editingUnit.isActive}
                              onChange={(event) => setEditingUnit((current) => (current ? { ...current, isActive: event.target.checked } : current))}
                              type="checkbox"
                            />
                          ) : unit.is_active ? (
                            'Yes'
                          ) : (
                            'No'
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button disabled={savingCode === unit.code} onClick={handleSaveEdit} type="button" variant="secondary">
                                  {savingCode === unit.code ? 'Saving…' : 'Save'}
                                </Button>
                                <Button onClick={() => setEditingUnit(null)} type="button" variant="ghost">
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  onClick={() =>
                                    setEditingUnit({
                                      originalCode: unit.code,
                                      code: unit.code,
                                      label: unit.label,
                                      sortOrder: String(unit.sort_order),
                                      isActive: unit.is_active,
                                    })
                                  }
                                  type="button"
                                  variant="ghost"
                                >
                                  Edit
                                </Button>
                                <Button disabled={deletingCode === unit.code} onClick={() => void handleDeleteUnit(unit)} type="button" variant="danger">
                                  {deletingCode === unit.code ? 'Deleting…' : 'Delete'}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
