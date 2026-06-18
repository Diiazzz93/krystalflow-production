
## Goal

Imported Unleashed Sales Orders become a **master production job** in KrystalFlow that tracks Original → Completed → Remaining (boxes + pallets) as pallets pass QC. KrystalFlow never modifies the SO itself; Unleashed Assemblies are created **per QC-approved pallet** instead of one big Assembly at import time.

## Data model (Job)

Add to `Job` (in `src/lib/types.ts`) and persist via `data` jsonb:
- `originalQuantity` (boxes/bottles — same unit as `quantity`)
- `originalPallets`
- `completedQuantity` (derived from QC entries; mirrored for fast reads)
- `completedPallets` (mirror of `palletsCompleted`)

Derived (computed, never written):
- `remainingQuantity = originalQuantity - completedQuantity`
- `remainingPallets = originalPallets - completedPallets`
- `percentComplete = completedPallets / originalPallets`

Per `QCEntry` add:
- `palletQuantity` (boxes on that pallet — defaults to `originalQuantity / originalPallets`, editable in QC dialog)
- `qcApproved: boolean` (true when Pass and supervisor signs off)
- `unleashedAssemblyId`, `unleashedAssemblyNumber`, `unleashedAssemblyStatus` (the per-pallet Assembly)

## Import changes (`src/lib/unleashed/fill-ready.server.ts`)

- **Stop creating the big Assembly.** Remove the `ulPost("/Assemblies", …)` call and the `findExistingAssembly` lookup at import time. Keep BOM fetch only — its lines populate `assemblyComponents` on the master job so the stock blueprint still works.
- Set `originalQuantity = bottleCount` (or `qty` for non-boxed), `originalPallets = data.pallets ?? 1`, `completedQuantity = 0`, `completedPallets = 0` on insert.
- Drop `unleashed_assembly_id` / `unleashed_assembly_number` on the job row (these now live on QC entries). Backfill pass that fetched assembly detail is removed.

## QC approval workflow (`src/components/jobs/QCDialog.tsx` + `src/lib/store.tsx`)

When a QC entry is submitted with `result === "Pass"` and supervisor signature present → `qcApproved = true`:
1. `updateJob`: increment `completedQuantity += palletQuantity`, `completedPallets += 1`. Clamp so neither exceeds original.
2. Call new server function `createPalletAssembly({ jobId, qcEntryId, quantity })` →
   - Posts `/Assemblies` to Unleashed with `Quantity = palletQuantity`, product = job's SKU, comment referencing SO + pallet code.
   - Optionally completes it (`AssemblyStatus = Completed`) if `autoCompleteAssembly` toggle is on.
   - Returns `{ assemblyId, assemblyNumber, status }` which gets stored back on the QC entry.
3. Toast shows "Pallet approved · Assembly KS-… created".

Fails are non-blocking: assembly errors are logged to `unleashed_sync_log` and surfaced via toast; completion totals still increment.

## Stock requirements (`src/lib/job-stock.ts`)

`computeJobStockCheck` switches its base quantity from `job.quantity` → `job.remainingQuantity ?? job.quantity`. For the `assemblyComponents` branch, scale component quantities by `remaining / original` ratio so BOM-based requirements also shrink as pallets complete.

## UI

**Job dialog / Job card** — new "Production progress" section:
```
Original order:   1000 boxes (10 pallets)
Completed:        500 boxes (5 pallets) — 50%
Remaining:        500 boxes (5 pallets)
[████████████░░░░░░░░░░░░]
```
Plus per-pallet assembly list (pallet # → Assembly number + status).

**Dashboard (`src/routes/index.tsx`)** — add cards:
- Total pallets across active jobs / completed / remaining
- Aggregated remaining materials required (sum of `computeJobStockCheck` across active jobs)

## Migration

`production_jobs` already stores rich fields in `data` jsonb, so no schema change is strictly required — the new fields ride along. We will still add a small migration to drop the obsolete columns from the job row by leaving them nullable (`unleashed_assembly_id`, `unleashed_assembly_number` stay on the table but are no longer written by the importer; existing rows keep their values for reference).

No new tables.

## Out of scope (explicit)

- No invoice creation, no child SOs, no SO modification in Unleashed.
- No change to scheduling/calendar behaviour.
- Hard-delete and "Unschedule" flows untouched.

## Files to edit

- `src/lib/types.ts` — add Job + QCEntry fields
- `src/lib/store.tsx` — map new fields; recompute completed on QC add; expose `unscheduleJob` unchanged
- `src/lib/unleashed/fill-ready.server.ts` — remove upfront Assembly creation, set original totals
- `src/lib/unleashed/assembly.functions.ts` *(new)* — `createPalletAssembly` server fn (auth + admin import inside handler)
- `src/lib/job-stock.ts` — base on `remainingQuantity`
- `src/components/jobs/QCDialog.tsx` — palletQuantity input, trigger assembly create on pass
- `src/components/jobs/JobDialog.tsx` — progress section
- `src/routes/index.tsx` — dashboard progress + remaining materials cards
