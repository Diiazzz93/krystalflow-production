
DROP POLICY IF EXISTS "Authenticated can insert QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Authenticated can update QC records" ON public.pallet_qc_records;
DROP POLICY IF EXISTS "Authenticated can delete QC records" ON public.pallet_qc_records;

CREATE POLICY "Users can insert their own QC records"
ON public.pallet_qc_records
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Staff can update QC records"
ON public.pallet_qc_records
FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'manager'::app_role)
  OR private.has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'manager'::app_role)
  OR private.has_role(auth.uid(), 'operator'::app_role)
);

CREATE POLICY "Admin/Manager can delete QC records"
ON public.pallet_qc_records
FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'manager'::app_role)
);
