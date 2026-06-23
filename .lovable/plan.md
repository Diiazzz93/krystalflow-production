## Problem

Since we moved to **one Assembly per QC-approved pallet**, brand-new jobs (like the active IPA fill) have no `unleashedAssemblyNumber` until the first pallet passes QC. The Stock/Assembly tabs in the Job dialog gate everything on `hasLinkedAssembly`, so they show:

- "No linked Unleashed Assembly for this job"
- "No assembly components imported"
- Stock requirements card stays empty → operators can't see what raw material/caps/labels are needed before they start filling.

The Sales Order import already fetches the product's **Bill of Materials** (BOM) and writes `assemblyComponents` into `data`, so the data we need exists in Unleashed independent of any Assembly — we're just not using it as a fallback in the UI, and older jobs imported before the refactor never got their BOM stored.

## Fix — use the BOM as the source of truth for stock requirements

Treat the BOM (scaled by the job's carton/bottle quantity) as the authoritative "what this job needs" list. Only override component quantities with Assembly Lines once a per-pallet Assembly actually exists.

### 1. New server function: `refreshJobBomComponents`

File: `src/lib/unleashed/fill-ready.functions.ts` (next to the existing `refreshJobAssemblyComponents`).

- Auth: `requireSupabaseAuth`, admin/manager/operator allowed.
- Input: `{ jobId }`.
- Loads the job's SKU and primary quantity (cartons).
- Looks up the Unleashed product GUID by `productCode`.
- Fetches `/BillOfMaterials?productGuid=…` (reuse `fetchBom` from `fill-ready.server.ts`).
- Scales each BOM line by the job's carton quantity (same math as importer).
- Writes the resulting list into `production_jobs.data.assemblyComponents` (merge, don't overwrite other keys).
- Returns the new components + scaled quantity for the dialog to hydrate.

### 2. JobStockDialog — auto-pull BOM on open, regardless of Assembly link

`src/components/jobs/JobStockDialog.tsx`

- Replace the `hasLinkedAssembly` gate (line 146-147) so the effect fires whenever the dialog opens for a job with no components but a known SKU.
- Prefer `refreshJobBomComponents` for the no-assembly case; keep `refreshJobAssemblyComponents` for jobs that DO have an Assembly linked (so per-pallet Assembly Lines override the BOM blueprint).
- Update the empty-state text in `AssemblyInfoBlock` and `AssemblyComponentsTable` to reflect the new model:
  - "No Assembly linked yet — Assemblies are created per pallet after QC approval. Components shown below come from the product's Bill of Materials."

### 3. Manual "Pull from Unleashed BOM" button

In the Stock tab header of `JobStockDialog`, add a small button (admins/managers) that calls `refreshJobBomComponents` on demand for cases where the auto-pull fails (network blip, product code typo, etc.).

### 4. Stock requirements card already works

`computeJobStockCheck` already iterates `job.assemblyComponents`, so as soon as components are populated from the BOM, the "Stock requirements" header in the dialog will switch from "No stock selected" to the real list — no changes needed there.

## Technical Details

- `fetchBom` is currently un-exported in `fill-ready.server.ts`; export it so the new server function can reuse it without duplicating the Unleashed call shape.
- Quantity scaling uses the same `parseProductPackaging` + `qty × ComponentQuantity` formula already in the importer to stay consistent between newly-imported and back-filled jobs.
- The per-pallet Assembly flow in `assembly.functions.ts` is untouched — it still creates one Assembly per QC pallet.
- Once a real Assembly exists, `refreshJobAssemblyComponents` continues to overwrite the BOM-derived components with the Assembly Lines (which may differ slightly if a planner edited the Assembly in Unleashed).

## Files Touched

- `src/lib/unleashed/fill-ready.server.ts` — export `fetchBom`, add small helper to build BOM components for a job.
- `src/lib/unleashed/fill-ready.functions.ts` — new `refreshJobBomComponents` server function.
- `src/components/jobs/JobStockDialog.tsx` — auto-pull BOM when no Assembly is linked, manual refresh button, updated empty-state copy.

## Out of Scope

- Changing when/how per-pallet Assemblies are created.
- Editing stored BOM data for historical jobs in bulk (the auto-pull on next dialog open handles backfill lazily).
