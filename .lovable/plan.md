## Good news

A job‑sheet PDF generator already exists (`src/lib/job-pdf.ts`, jsPDF). It already pulls in:
- Job fields (customer, product, SKU, qty, line, operator, scheduled date)
- Customer Product Spec (packing, palletising, special instructions)
- Line Setup preset (fill, conveyor, capper, label, sensors)
- Branding (company logo at top)

It is already wired into the Jobs page table and the mobile card list as a "PDF" button. We will extend coverage and polish the content to match your spec.

## Scope

### 1. Expose Print + Download PDF on every job surface

Add a small action group ( Print / PDF ) next to the existing actions in:
- `src/routes/jobs.tsx` – desktop table row, mobile card (already has PDF → add Print)
- `src/routes/live.tsx` – Live Board running-job card + queue rows
- `src/routes/calendar.tsx` – job pill / popover
- `src/routes/index.tsx` – Dashboard "Active production" job rows
- `src/components/jobs/JobDialog.tsx` – footer of the job edit dialog

Print button = generates the same PDF in memory and calls `doc.autoPrint()` + opens in a new tab so the browser print dialog appears immediately (no separate HTML print view needed; one source of truth).

Download PDF button = existing `downloadJobPdf(job, presets)` behaviour.

Both buttons live in one small reusable component `src/components/jobs/JobSheetActions.tsx` so every surface uses the same thing.

### 2. Bring the PDF content up to your spec

Audit `src/lib/job-pdf.ts` and adjust so the one‑page (max two‑page) sheet has these clearly labelled sections, in this order, with large operator‑friendly type:

1. Header band: company logo + "PRODUCTION JOB SHEET" + Job # (job.id short form)
2. **Job Information** – customer, product, SKU, qty to produce, scheduled date, line, operator
3. **Product Requirements** – bottle, cap, label, carton, liquid, bottles/carton, estimated pallets
4. **Stock Requirements** – required bottles / caps / labels / cartons / liquid volume (uses `computeJobStockCheck` from `src/lib/job-stock.ts`)
5. **Special Instructions** – pulled from Customer Product Spec: packing notes, pallet config, carton requirements, label placement, special customer requirements, handling
6. **Line Setup** – fill / conveyor / capper / label / sensor values from the matched preset
7. **QC Section** – ruled boxes for Operator signature, QC signature, Start time, Finish time, Notes

Strict black‑and‑white printable styling, generous line height, minimal chrome — no ERP filler.

### 3. Minor polish

- If no line‑setup preset matches, show "No preset saved" rather than blank rows.
- If no customer spec matches, show "No special instructions on file" rather than empty section.
- Filename: `JobSheet_{customer}_{sku}_{shortId}.pdf`.

## Out of scope (call out for follow‑up)

- A separate human‑readable Job Number (e.g. `JOB‑2026‑001`). Today `job.id` (UUID) is used — works but ugly. If you want sequential numbers, that's a separate schema change.
- Migrating Customer Product Specs from localStorage to the database. Today specs are device‑local, so the PDF will only include spec data on the device where the spec was entered.

## Technical notes

- No new dependencies. jsPDF is already installed.
- Print uses `jsPDF.output('bloburl')` + `window.open` + `autoPrint()` — works on Chrome/Edge/Safari without a separate print stylesheet.
- All data is already in client stores (jobs, specs, line setups, stock, branding), so PDF generation is instant and offline‑safe.
