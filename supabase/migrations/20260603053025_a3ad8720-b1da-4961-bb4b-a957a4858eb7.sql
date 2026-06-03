-- Inventory items table
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  available_stock numeric NOT NULL DEFAULT 0,
  allocated_stock numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  location text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'units',
  source text,
  notes text,
  date_received date,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_inventory_items_sku ON public.inventory_items(sku);
CREATE INDEX idx_inventory_items_category ON public.inventory_items(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view inventory"
  ON public.inventory_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager can insert inventory"
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role) OR
    private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin/Manager can update inventory"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role) OR
    private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin/Manager can delete inventory"
  ON public.inventory_items FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role) OR
    private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE TRIGGER trg_inventory_items_updated
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Production jobs table
CREATE TABLE public.production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer text NOT NULL DEFAULT '',
  product text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Scheduled',
  operator text NOT NULL DEFAULT '',
  line text NOT NULL DEFAULT '',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_production_jobs_status ON public.production_jobs(status);
CREATE INDEX idx_production_jobs_customer ON public.production_jobs(customer);
CREATE INDEX idx_production_jobs_scheduled_start ON public.production_jobs(scheduled_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_jobs TO authenticated;
GRANT ALL ON public.production_jobs TO service_role;

ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view jobs"
  ON public.production_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager can insert jobs"
  ON public.production_jobs FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role) OR
    private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin/Manager/Operator can update jobs"
  ON public.production_jobs FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role) OR
    private.has_role(auth.uid(), 'manager'::public.app_role) OR
    private.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY "Admin/Manager can delete jobs"
  ON public.production_jobs FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role) OR
    private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE TRIGGER trg_production_jobs_updated
BEFORE UPDATE ON public.production_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();