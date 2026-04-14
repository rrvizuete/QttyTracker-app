create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  access_level text not null default 'admin' check (access_level in ('admin', 'engineer', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index if not exists profiles_email_idx on public.profiles (email);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

create policy if not exists "Users can read their own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy if not exists "Users can insert their own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy if not exists "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
