DROP POLICY IF EXISTS "Admin/Manager can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin/Manager can update settings" ON public.app_settings;

CREATE POLICY "Staff can insert settings"
ON public.app_settings FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'manager'::app_role)
  OR private.has_role(auth.uid(), 'operator'::app_role)
);

CREATE POLICY "Staff can update settings"
ON public.app_settings FOR UPDATE TO authenticated
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