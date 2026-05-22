
-- 1. Role enum
create type public.app_role as enum ('admin', 'manager', 'operator', 'viewer');

-- 2. Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 3. User roles table (separate to prevent privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 4. Security-definer role checker (avoids RLS recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 5. RLS: profiles
create policy "Users can view their own profile"
on public.profiles for select to authenticated
using (auth.uid() = id);

create policy "Admins can view all profiles"
on public.profiles for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

create policy "Admins can update any profile"
on public.profiles for update to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- 6. RLS: user_roles
create policy "Users can view their own roles"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

create policy "Admins can view all roles"
on public.user_roles for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert roles"
on public.user_roles for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update roles"
on public.user_roles for update to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete roles"
on public.user_roles for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- 7. updated_at trigger for profiles
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 8. Auto-create profile + role on signup.
--    First user becomes admin; everyone else starts as viewer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_name text;
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );

  -- First-ever user becomes admin
  if (select count(*) from public.user_roles) = 0 then
    v_role := 'admin';
  else
    v_role := 'viewer';
  end if;

  insert into public.user_roles (user_id, role) values (new.id, v_role);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
