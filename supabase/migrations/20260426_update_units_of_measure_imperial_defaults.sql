-- Replace metric-heavy seed list with Imperial-first defaults.
insert into public.units_of_measure (code, label, sort_order, is_active)
values
  ('CF', 'Cubic Foot (CF)', 1, true),
  ('CY', 'Cubic Yard (CY)', 2, true),
  ('SF', 'Square Foot (SF)', 3, true),
  ('SY', 'Square Yard (SY)', 4, true),
  ('TON', 'Ton (TON)', 5, true),
  ('LF', 'Linear Foot (LF)', 6, true),
  ('AC', 'Acre (AC)', 7, true),
  ('EA', 'Each (EA)', 8, true),
  ('LS', 'Lump Sum (LS)', 9, true),
  ('HR', 'Hour (HR)', 10, true),
  ('DAY', 'Day (DAY)', 11, true)
on conflict (code) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

update public.units_of_measure
set is_active = false
where code not in ('CF', 'CY', 'SF', 'SY', 'TON', 'LF', 'AC', 'EA', 'LS', 'HR', 'DAY');

-- Allow authenticated users to maintain UoM from Settings.
drop policy if exists "Global admins can manage units of measure" on public.units_of_measure;
drop policy if exists "Authenticated users can manage units of measure" on public.units_of_measure;
create policy "Authenticated users can manage units of measure"
on public.units_of_measure
for all
to authenticated
using (true)
with check (true);
