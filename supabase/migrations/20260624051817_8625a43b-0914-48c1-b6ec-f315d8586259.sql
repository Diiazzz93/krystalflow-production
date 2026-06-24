
DROP POLICY IF EXISTS "Authenticated can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can update settings" ON public.app_settings;

CREATE POLICY "Admin/Manager can insert settings" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin/Manager can update settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Users can insert their own QC records" ON public.pallet_qc_records;

CREATE POLICY "Staff can insert QC records" ON public.pallet_qc_records
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'manager'::app_role)
      OR private.has_role(auth.uid(), 'operator'::app_role)
    )
  );
