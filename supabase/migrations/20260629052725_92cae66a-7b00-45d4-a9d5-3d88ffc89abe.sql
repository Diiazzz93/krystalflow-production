ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pending';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_role public.app_role;
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );

  if (select count(*) from public.user_roles) = 0 then
    v_role := 'admin';
  else
    v_role := 'pending';
  end if;

  insert into public.user_roles (user_id, role) values (new.id, v_role);
  return new;
end;
$function$;