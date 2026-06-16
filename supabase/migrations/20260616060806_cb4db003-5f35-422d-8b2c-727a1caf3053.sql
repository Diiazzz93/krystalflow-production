
CREATE TABLE public.shipped_pallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  pallet_number integer NOT NULL CHECK (pallet_number > 0),
  shipped_at timestamptz NOT NULL DEFAULT now(),
  shipped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, pallet_number)
);

CREATE INDEX idx_shipped_pallets_job ON public.shipped_pallets(job_id);
CREATE INDEX idx_shipped_pallets_shipped_at ON public.shipped_pallets(shipped_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipped_pallets TO authenticated;
GRANT ALL ON public.shipped_pallets TO service_role;

ALTER TABLE public.shipped_pallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view shipped pallets"
  ON public.shipped_pallets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager/Operator can insert shipped pallets"
  ON public.shipped_pallets FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'operator'::app_role)
  );

CREATE POLICY "Admin/Manager/Operator can update shipped pallets"
  ON public.shipped_pallets FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'operator'::app_role)
  );

CREATE POLICY "Admin/Manager/Operator can delete shipped pallets"
  ON public.shipped_pallets FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'operator'::app_role)
  );

CREATE TRIGGER trg_shipped_pallets_updated
  BEFORE UPDATE ON public.shipped_pallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
