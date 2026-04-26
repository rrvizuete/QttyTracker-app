create table if not exists public.progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_item_id uuid not null references public.budget_items(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete restrict,
  reporting_date date not null default current_date,
  installed_quantity numeric(18,3) not null check (installed_quantity >= 0),
  percent_complete numeric(5,2) check (percent_complete is null or (percent_complete >= 0 and percent_complete <= 100)),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists progress_updates_project_date_idx on public.progress_updates (project_id, reporting_date desc);
create index if not exists progress_updates_budget_item_idx on public.progress_updates (budget_item_id);
create index if not exists progress_updates_reporter_idx on public.progress_updates (reporter_id);

create or replace function public.handle_progress_updates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_progress_updates_budget_item_project()
returns trigger
language plpgsql
as $$
declare
  budget_project_id uuid;
begin
  select bi.project_id into budget_project_id
  from public.budget_items bi
  where bi.id = new.budget_item_id;

  if budget_project_id is null then
    raise exception 'Budget item does not exist.';
  end if;

  if budget_project_id <> new.project_id then
    raise exception 'Progress update project must match budget item project.';
  end if;

  return new;
end;
$$;

create or replace function public.is_project_engineer_or_admin(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.role in ('admin', 'engineer')
  );
$$;

drop trigger if exists progress_updates_set_updated_at on public.progress_updates;
create trigger progress_updates_set_updated_at
before update on public.progress_updates
for each row
execute function public.handle_progress_updates_updated_at();

drop trigger if exists progress_updates_validate_budget_project on public.progress_updates;
create trigger progress_updates_validate_budget_project
before insert or update on public.progress_updates
for each row
execute function public.validate_progress_updates_budget_item_project();

alter table public.progress_updates enable row level security;

drop policy if exists "Members can read progress updates" on public.progress_updates;
create policy "Members can read progress updates"
on public.progress_updates
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

drop policy if exists "Engineers and admins can insert progress updates" on public.progress_updates;
create policy "Engineers and admins can insert progress updates"
on public.progress_updates
for insert
to authenticated
with check (
  public.is_global_admin()
  or (reporter_id = auth.uid() and public.is_project_engineer_or_admin(project_id))
);

drop policy if exists "Engineers and admins can update progress updates" on public.progress_updates;
create policy "Engineers and admins can update progress updates"
on public.progress_updates
for update
to authenticated
using (
  public.is_global_admin()
  or (public.is_project_engineer_or_admin(project_id) and reporter_id = auth.uid())
)
with check (
  public.is_global_admin()
  or (public.is_project_engineer_or_admin(project_id) and reporter_id = auth.uid())
);

drop policy if exists "Admins can delete progress updates" on public.progress_updates;
create policy "Admins can delete progress updates"
on public.progress_updates
for delete
to authenticated
using (
  public.is_global_admin()
  or public.is_project_admin(project_id)
);
