# Plan: Customer-supplied stock jobs

## What we're solving
Some customers supply their own bottles, caps, labels, cartons or liquid. You still want to log QC and track what they provided, but you don't want those materials counted against Krystal's inventory or blocking the job with "out of stock" warnings. You also want to decide per job whether a per-pallet Unleashed Assembly should be created when QC passes.

## What we'll build

1. **Per-job stock-source switch**
   - Add a "Stock source" toggle on every job: **Krystal supplied** (default) or **Customer supplied**.
   - When set to **Customer supplied**, the job will not trigger stock-shortage alerts and will not try to deduct stock from Krystal's inventory.

2. **Record what the customer supplied**
   - When a job is customer-supplied, show editable fields for the items the customer provided: bottles, caps, labels, cartons and liquid (quantity + unit).
   - These values are saved on the job and shown read-only inside the QC form so operators know what materials were used.

3. **Skip stock checks for customer-supplied jobs**
   - Update the stock-requirements logic so customer-supplied jobs are always treated as "ready".
   - The Stock tab will show a "Customer supplied" badge and list the recorded materials instead of showing red/amber shortages.

4. **Per-job Unleashed Assembly toggle**
   - Add a "Create Unleashed Assembly on QC pass" switch on each job (default ON).
   - When OFF, QC passes will still log the pallet and print the sticker, but the app will not call Unleashed to create an Assembly.

5. **Allow Unleashed imports without a BOM**
   - Currently a Fill Ready Sales Order is rejected if Unleashed has no Bill of Materials for the product.
   - We'll make the BOM optional: if it's missing, the job still imports with no components, and you can open the job and switch it to "Customer supplied".

6. **Visual indicators**
   - Customer-supplied jobs get a badge on the Jobs list, Live Board cards and QC/Shipping views so staff can see at a glance that materials came from the customer.

## Files that will change

- `src/lib/types.ts` — add `stockSource`, `customerSuppliedItems`, `createUnleashedAssembly` to the `Job` type.
- `src/components/jobs/JobDialog.tsx` — add the stock-source toggle, customer-supplied item fields and the Assembly toggle.
- `src/lib/job-stock.ts` — treat customer-supplied jobs as ready and surface the recorded items.
- `src/components/jobs/JobStockDialog.tsx` / `JobStockCheck.tsx` — show "Customer supplied" state and list.
- `src/components/jobs/QCDialog.tsx` — only create Unleashed Assembly when enabled; show customer-supplied items.
- `src/lib/unleashed/fill-ready.server.ts` — make BOM optional on import.
- `src/routes/jobs.tsx` and `src/routes/live.tsx` — add the customer-supplied badge.

## Notes / trade-offs

- No database migration is needed: job fields live in the existing `data` JSONB column, so the new settings will round-trip automatically.
- If a customer-supplied job still has a Unleashed BOM, you can leave the stock source as "Krystal supplied" and the normal stock check will run.
- The default for existing jobs stays exactly as it is today (Krystal supplied, Assembly creation ON), so nothing changes until you flip the switch on a job.
