ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS unleashed_group text;
CREATE INDEX IF NOT EXISTS inventory_items_unleashed_group_idx ON public.inventory_items (unleashed_group);