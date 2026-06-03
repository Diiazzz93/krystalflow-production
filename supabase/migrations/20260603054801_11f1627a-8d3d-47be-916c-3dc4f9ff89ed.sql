GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_jobs TO authenticated;

GRANT ALL ON public.profiles        TO service_role;
GRANT ALL ON public.user_roles      TO service_role;
GRANT ALL ON public.inventory_items TO service_role;
GRANT ALL ON public.production_jobs TO service_role;

GRANT USAGE   ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;