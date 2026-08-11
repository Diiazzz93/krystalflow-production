update public.production_jobs
set status = 'Filling',
    data = data
      || jsonb_build_object(
           'originalPallets', (data->>'pallets')::numeric,
           'status', 'Filling'
         )
      - 'actualEnd'
where id = '1e7a005a-c3fb-4638-8420-34dbcbaa2409';