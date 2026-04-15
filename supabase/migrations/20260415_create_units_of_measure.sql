create table if not exists public.units_of_measure (
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists units_of_measure_label_idx on public.units_of_measure (label);
create index if not exists units_of_measure_active_sort_idx on public.units_of_measure (is_active, sort_order, label);

create or replace function public.handle_units_of_measure_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists units_of_measure_set_updated_at on public.units_of_measure;
create trigger units_of_measure_set_updated_at
before update on public.units_of_measure
for each row
execute function public.handle_units_of_measure_updated_at();

insert into public.units_of_measure (code, label, sort_order)
values
  ('ea', 'Each (ea)', 1),
  ('no', 'Number (no)', 2),
  ('ls', 'Lump Sum (ls)', 3),
  ('m', 'Meter (m)', 4),
  ('m2', 'Square Meter (m²)', 5),
  ('m3', 'Cubic Meter (m³)', 6),
  ('kg', 'Kilogram (kg)', 7),
  ('t', 'Ton (t)', 8),
  ('hr', 'Hour (hr)', 9),
  ('day', 'Day', 10)
on conflict (code) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.units_of_measure enable row level security;

drop policy if exists "Authenticated users can read units of measure" on public.units_of_measure;
create policy "Authenticated users can read units of measure"
on public.units_of_measure
for select
to authenticated
using (is_active = true or public.is_global_admin());

drop policy if exists "Global admins can manage units of measure" on public.units_of_measure;
create policy "Global admins can manage units of measure"
on public.units_of_measure
for all
to authenticated
using (public.is_global_admin())
with check (public.is_global_admin());
