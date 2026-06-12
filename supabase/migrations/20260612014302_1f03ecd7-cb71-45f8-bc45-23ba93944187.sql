CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;

  if to_jsonb(new) ? 'last_updated' then
    new := jsonb_populate_record(new, jsonb_build_object('last_updated', now()));
  end if;

  return new;
end;
$function$;