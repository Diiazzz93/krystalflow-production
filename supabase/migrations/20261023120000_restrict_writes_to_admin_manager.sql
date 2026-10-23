-- Runs after 20261023110000_restrict_unapproved_data_access.sql.
-- That migration already limits reads to approved roles (admin, manager,
-- operator, and viewer). This file does not replace those read policies.
-- It only tightens writes: creating, editing, or deleting quality-control
-- records and shared settings requires admin or manager. Stock-adjustment
-- history stays append-only: admins and managers can add a row, and nobody
-- can rewrite or delete one. Existing accounts and roles are not changed.

-- Quality control -----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Authenticated can update QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Authenticated can delete QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Users can insert their own QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Staff can insert QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Staff can update QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Admin/Manager can insert QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Admin/Manager can update QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Admin/Manager can delete QC records" ON public.pallet_qc_records;

CREATE POLICY "Admin/Manager can insert QC records"
  ON public.pallet_qc_records
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'manager'::public.app_role)
    )
  );

CREATE POLICY "Admin/Manager can update QC records"
  ON public.pallet_qc_records
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin/Manager can delete QC records"
  ON public.pallet_qc_records
  FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- "Approved users can read QC records" from the previous migration stays.

-- Stock adjustments ---------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Staff can insert adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Admin/Manager can insert adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Authenticated can update adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Staff can update adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Admin/Manager can update adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Authenticated can delete adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Staff can delete adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Admin/Manager can delete adjustments" ON public.stock_adjustments;

CREATE POLICY "Admin/Manager can insert adjustments"
  ON public.stock_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- No update or delete policy, and no grant for those actions. The history
-- cannot be edited or removed by any role, including admin.
REVOKE UPDATE, DELETE ON public.stock_adjustments FROM authenticated, anon;

-- "Approved users can view adjustments" from the previous migration stays.

-- Shared settings (branding, presets, line setups, customer specs, and
-- other values stored in app_settings) -------------------------------------
DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin/Manager can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin/Manager can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin/Manager can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Staff can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Staff can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Staff can delete settings" ON public.app_settings;

CREATE POLICY "Admin/Manager can insert settings"
  ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin/Manager can update settings"
  ON public.app_settings
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- Settings rows are updated in place. Delete is not granted.
REVOKE DELETE ON public.app_settings FROM authenticated, anon;

-- "Approved users can view settings" from the previous migration stays.
