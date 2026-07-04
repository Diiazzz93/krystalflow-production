DROP INDEX IF EXISTS public.idx_production_jobs_unleashed_so;

CREATE UNIQUE INDEX idx_production_jobs_unleashed_so
ON public.production_jobs (unleashed_sales_order_id)
WHERE unleashed_sales_order_id IS NOT NULL
  AND lower(status) <> 'complete';