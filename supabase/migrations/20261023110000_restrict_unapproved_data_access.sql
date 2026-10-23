-- Signed-in users with no approved role could read factory data.
-- SELECT policies on the operational tables used USING (true), so any
-- authenticated JWT — including a brand-new "pending" account, or an
-- account whose user_roles row was removed — could read jobs, stock,
-- shipments, QC records, and app settings through the public API.
--
-- Approved roles (admin, manager, operator, viewer) keep the same read
-- access they have today. Writes are unchanged.
-- A user can still read and update their own profile, and read their own
-- role row, so sign-in and the "awaiting approval" screen keep working.

CREATE OR REPLACE FUNCTION private.has_app_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IS DISTINCT FROM 'pending'::public.app_role
  )
$$;

REVOKE ALL ON FUNCTION private.has_app_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_app_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.has_app_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_app_access(uuid) TO service_role;

DROP POLICY IF EXISTS "Authenticated can view inventory" ON public.inventory_items;
CREATE POLICY "Approved users can view inventory"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (private.has_app_access(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view jobs" ON public.production_jobs;
CREATE POLICY "Approved users can view jobs"
  ON public.production_jobs FOR SELECT TO authenticated
  USING (private.has_app_access(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view adjustments" ON public.stock_adjustments;
CREATE POLICY "Approved users can view adjustments"
  ON public.stock_adjustments FOR SELECT TO authenticated
  USING (private.has_app_access(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view shipped pallets" ON public.shipped_pallets;
CREATE POLICY "Approved users can view shipped pallets"
  ON public.shipped_pallets FOR SELECT TO authenticated
  USING (private.has_app_access(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read QC records" ON public.pallet_qc_records;
CREATE POLICY "Approved users can read QC records"
  ON public.pallet_qc_records FOR SELECT TO authenticated
  USING (private.has_app_access(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view settings" ON public.app_settings;
CREATE POLICY "Approved users can view settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (private.has_app_access(auth.uid()));
