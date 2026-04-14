create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin', 'engineer', 'viewer')),
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create index if not exists project_members_project_idx on public.project_members (project_id);
create index if not exists project_members_user_idx on public.project_members (user_id);

alter table public.project_members enable row level security;

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.access_level = 'admin'
  );
$$;

create or replace function public.is_project_admin(target_project uuid)
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
      and pm.role = 'admin'
  );
$$;

drop policy if exists "Authenticated users can read projects" on public.projects;
drop policy if exists "Authenticated users can insert projects" on public.projects;
drop policy if exists "Authenticated users can update projects" on public.projects;
drop policy if exists "Authenticated users can delete projects" on public.projects;

drop policy if exists "Admins can read projects" on public.projects;
create policy "Admins can read projects"
on public.projects
for select
to authenticated
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "Admins can create projects" on public.projects;
create policy "Admins can create projects"
on public.projects
for insert
to authenticated
with check (public.is_global_admin());

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
on public.projects
for update
to authenticated
using (public.is_global_admin() or public.is_project_admin(id))
with check (public.is_global_admin() or public.is_project_admin(id));

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
on public.projects
for delete
to authenticated
using (public.is_global_admin() or public.is_project_admin(id));

create or replace function public.add_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict (project_id, user_id) do update set role = excluded.role;

  return new;
end;
$$;

drop trigger if exists projects_create_owner_membership on public.projects;
create trigger projects_create_owner_membership
after insert on public.projects
for each row
execute function public.add_project_owner_membership();

drop policy if exists "Project members can read memberships" on public.project_members;
create policy "Project members can read memberships"
on public.project_members
for select
to authenticated
using (
  public.is_global_admin()
  or user_id = auth.uid()
  or public.is_project_admin(project_id)
);

drop policy if exists "Admins can insert memberships" on public.project_members;
create policy "Admins can insert memberships"
on public.project_members
for insert
to authenticated
with check (
  public.is_global_admin()
  or public.is_project_admin(project_id)
);

drop policy if exists "Admins can update memberships" on public.project_members;
create policy "Admins can update memberships"
on public.project_members
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

drop policy if exists "Admins can delete memberships" on public.project_members;
create policy "Admins can delete memberships"
on public.project_members
for delete
to authenticated
using (
  public.is_global_admin()
  or public.is_project_admin(project_id)
);
