CREATE TABLE public.pallet_qc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  pallet_code text NOT NULL UNIQUE,
  pallet_number integer NOT NULL,
  result text NOT NULL,
  operator_name text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pallet_qc_records TO authenticated;
GRANT ALL ON public.pallet_qc_records TO service_role;

ALTER TABLE public.pallet_qc_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read QC records"
  ON public.pallet_qc_records FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert QC records"
  ON public.pallet_qc_records FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update QC records"
  ON public.pallet_qc_records FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete QC records"
  ON public.pallet_qc_records FOR DELETE
  TO authenticated USING (true);

CREATE INDEX pallet_qc_records_job_id_idx ON public.pallet_qc_records(job_id);
CREATE INDEX pallet_qc_records_pallet_code_idx ON public.pallet_qc_records(pallet_code);

CREATE TRIGGER pallet_qc_records_set_updated_at
  BEFORE UPDATE ON public.pallet_qc_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();