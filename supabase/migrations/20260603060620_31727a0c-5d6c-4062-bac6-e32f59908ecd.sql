-- Stock adjustments audit trail
CREATE TABLE public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL DEFAULT '',
  adjustment_type text NOT NULL,
  quantity_change numeric NOT NULL,
  previous_quantity numeric NOT NULL,
  new_quantity numeric NOT NULL,
  reason text NOT NULL DEFAULT '',
  notes text,
  adjustment_date date NOT NULL DEFAULT (now()::date),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_adjustments_item ON public.stock_adjustments(inventory_item_id, created_at DESC);

GRANT SELECT, INSERT ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view adjustments"
  ON public.stock_adjustments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager can insert adjustments"
  ON public.stock_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role) OR
    private.has_role(auth.uid(), 'manager'::app_role)
  );
