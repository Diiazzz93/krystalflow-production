create or replace function public.set_sync_webhook_secret(p_secret text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if p_secret is null or length(p_secret) < 16 then raise exception 'invalid secret'; end if;
  select id into v_id from vault.secrets where name = 'sync_webhook_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'sync_webhook_secret', 'Header secret for sync-fill-ready cron');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;
revoke all on function public.set_sync_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.set_sync_webhook_secret(text) to service_role;