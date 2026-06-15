
-- 1) Production jobs: link to Unleashed SO/Assembly + approval audit
ALTER TABLE public.production_jobs
  ADD COLUMN IF NOT EXISTS unleashed_sales_order_id text,
  ADD COLUMN IF NOT EXISTS unleashed_sales_order_number text,
  ADD COLUMN IF NOT EXISTS unleashed_assembly_id text,
  ADD COLUMN IF NOT EXISTS unleashed_assembly_number text,
  ADD COLUMN IF NOT EXISTS imported_from_unleashed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assembly_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assembly_approved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_jobs_unleashed_so
  ON public.production_jobs (unleashed_sales_order_id)
  WHERE unleashed_sales_order_id IS NOT NULL;

-- 2) Sync log
CREATE TABLE IF NOT EXISTS public.unleashed_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id text,
  sales_order_number text,
  outcome text NOT NULL,
  message text,
  job_id uuid REFERENCES public.production_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unleashed_sync_log_created_at
  ON public.unleashed_sync_log (created_at DESC);

GRANT SELECT, INSERT ON public.unleashed_sync_log TO authenticated;
GRANT ALL ON public.unleashed_sync_log TO service_role;
ALTER TABLE public.unleashed_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Manager can view sync log"
  ON public.unleashed_sync_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin/Manager can insert sync log"
  ON public.unleashed_sync_log FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager'));

-- 3) App settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_app_settings_updated
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES ('assembly_completion_mode', '"manual"'::jsonb)
ON CONFLICT (key) DO NOTHING;
