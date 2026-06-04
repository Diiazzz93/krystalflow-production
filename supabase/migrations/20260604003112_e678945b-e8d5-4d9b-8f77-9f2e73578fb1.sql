ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS critical_level numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS alert_notes text;