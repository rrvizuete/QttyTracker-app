create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.budget_items(id) on delete cascade,
  code text not null,
  description text not null,
  level smallint not null check (level between 1 and 8),
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  uom text not null,
  rate numeric(18,2) not null default 0 check (rate >= 0),
  item_value numeric(18,2) generated always as ((quantity * rate)::numeric(18,2)) stored,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code),
  check (parent_id is null or parent_id <> id)
);

create index if not exists budget_items_project_idx on public.budget_items (project_id);
create index if not exists budget_items_parent_idx on public.budget_items (parent_id);
create index if not exists budget_items_project_level_idx on public.budget_items (project_id, level);

create or replace function public.handle_budget_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_budget_item_hierarchy()
returns trigger
language plpgsql
as $$
declare
  parent_project_id uuid;
  parent_level smallint;
begin
  if new.parent_id is null then
    if new.level <> 1 then
      raise exception 'Level must be 1 when no parent is provided.';
    end if;

    return new;
  end if;

  select bi.project_id, bi.level
  into parent_project_id, parent_level
  from public.budget_items bi
  where bi.id = new.parent_id;

  if parent_project_id is null then
    raise exception 'Parent budget item does not exist.';
  end if;

  if parent_project_id <> new.project_id then
    raise exception 'Parent budget item must belong to the same project.';
  end if;

  if new.level <> parent_level + 1 then
    raise exception 'Level must be parent level + 1.';
  end if;

  if new.level > 8 then
    raise exception 'Budget hierarchy supports up to 8 levels.';
  end if;

  return new;
end;
$$;

drop trigger if exists budget_items_set_updated_at on public.budget_items;
create trigger budget_items_set_updated_at
before update on public.budget_items
for each row
execute function public.handle_budget_items_updated_at();

drop trigger if exists budget_items_validate_hierarchy on public.budget_items;
create trigger budget_items_validate_hierarchy
before insert or update on public.budget_items
for each row
execute function public.validate_budget_item_hierarchy();

alter table public.budget_items enable row level security;

drop policy if exists "Members can read budget items" on public.budget_items;
create policy "Members can read budget items"
on public.budget_items
for select
to authenticated
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "Project admins can insert budget items" on public.budget_items;
create policy "Project admins can insert budget items"
on public.budget_items
for insert
to authenticated
with check (
  public.is_global_admin()
  or public.is_project_admin(project_id)
);

drop policy if exists "Project admins can update budget items" on public.budget_items;
create policy "Project admins can update budget items"
on public.budget_items
for update
to authenticated
using (
  public.is_global_admin()
  or public.is_project_admin(project_id)
)
with check (
  public.is_global_admin()
  or public.is_project_admin(project_id)
);

drop policy if exists "Project admins can delete budget items" on public.budget_items;
create policy "Project admins can delete budget items"
on public.budget_items
for delete
to authenticated
using (
  public.is_global_admin()
  or public.is_project_admin(project_id)
);
