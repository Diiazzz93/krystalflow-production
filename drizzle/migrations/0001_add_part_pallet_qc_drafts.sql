CREATE TABLE public.qc_pallet_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  standalone boolean NOT NULL DEFAULT false,
  pallet_number integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_pallet_drafts TO authenticated;
GRANT ALL ON public.qc_pallet_drafts TO service_role;
ALTER TABLE public.qc_pallet_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read part pallets" ON public.qc_pallet_drafts FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role) OR private.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Staff create part pallets" ON public.qc_pallet_drafts FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role) OR private.has_role(auth.uid(), 'operator'::public.app_role)));
CREATE POLICY "Staff update part pallets" ON public.qc_pallet_drafts FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role) OR private.has_role(auth.uid(), 'operator'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role) OR private.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Staff remove part pallets" ON public.qc_pallet_drafts FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role) OR private.has_role(auth.uid(), 'operator'::public.app_role));
CREATE FUNCTION public.finish_part_pallet(p_id uuid, p_updated_at timestamptz, p_entry jsonb) RETURNS public.pallet_qc_records LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE draft public.qc_pallet_drafts; saved public.pallet_qc_records;
BEGIN
  SELECT * INTO draft FROM public.qc_pallet_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR draft.updated_at <> p_updated_at THEN RAISE EXCEPTION 'Part pallet changed or already completed. Reopen it before saving.'; END IF;
  IF p_entry->>'jobId' <> draft.job_id THEN RAISE EXCEPTION 'Part pallet job cannot change during completion.'; END IF;
  INSERT INTO public.pallet_qc_records (id, job_id, pallet_code, pallet_number, result, operator_name, data, created_by)
  VALUES (p_id, draft.job_id, p_entry->>'palletCode', (p_entry->>'palletNumber')::integer, p_entry->>'result', p_entry->>'operatorName', p_entry, auth.uid()) RETURNING * INTO saved;
  DELETE FROM public.qc_pallet_drafts WHERE id = p_id;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_part_pallet(uuid, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_part_pallet(uuid, timestamptz, jsonb) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_pallet_drafts;