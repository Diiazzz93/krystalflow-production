# Unleashed "Fill Ready" Workflow

## Overview
KrystalFlow polls Unleashed for Sales Orders with status `Fill Ready`. Each one becomes a Production Job + a linked Assembly built from the product's BOM. Production runs in KrystalFlow; an admin/manager later approves the Assembly which completes it in Unleashed. The Sales Order itself is never touched.

## Database changes

New columns on `production_jobs`:
- `unleashed_sales_order_id` (text, unique nullable) — prevents duplicate imports
- `unleashed_sales_order_number` (text)
- `unleashed_assembly_id` (text)
- `unleashed_assembly_number` (text)
- `imported_from_unleashed_at` (timestamptz)
- `assembly_approved_by` (uuid → auth.users)
- `assembly_approved_at` (timestamptz)
- Extend existing `status` to allow `pending_assembly_approval` and `assembly_completed`

New table `unleashed_sync_log`:
- `sales_order_id`, `sales_order_number`, `outcome` (imported/skipped/error), `message`, `created_at`
- For audit + duplicate-skip visibility on the Sync page

New role: add `'manager'` to `app_role` enum. Approval requires admin OR manager (`has_role`).

New table `app_settings` (key/value JSON, admin-only) to store:
- `assembly_completion_mode` = `manual` | `auto` (default `manual`)

## Server functions (`src/lib/unleashed/sales-orders.functions.ts`)

All `.middleware([requireSupabaseAuth])`:

1. `unleashedFetchFillReadySalesOrders()` — GET `/SalesOrders?orderStatus=Fill Ready`, paginated. Returns full SO including lines.
2. `unleashedFetchProductBom(productGuid)` — GET `/BillOfMaterials/{guid}` to get assembly components.
3. `importFillReadySalesOrders()` — orchestrator:
   - Fetch Fill Ready SOs
   - For each: skip if `unleashed_sales_order_id` exists in `production_jobs`
   - Pick primary line (largest qty); fetch its BOM (fail → log + skip)
   - Create Assembly in Unleashed via POST `/Assemblies` with BOM components
   - Insert `production_jobs` row: status=`pending`, store SO id/number, assembly id/number, customer, product, qty
   - Write `unleashed_sync_log` row
   - Returns `{ imported, skipped, errors }`
4. `completeUnleashedAssembly({ jobId })` — admin/manager only:
   - Verify role via `has_role`
   - Load job, POST `/Assemblies/{guid}/Complete` (or PUT status=Completed)
   - Update job: `status=assembly_completed`, `assembly_approved_by=userId`, `assembly_approved_at=now()`

## Frontend changes

### `/unleashed-sync` page
Add new card "Sales Orders (Fill Ready)":
- "Check now" button → calls `importFillReadySalesOrders`
- Shows last run results + recent `unleashed_sync_log` entries
- Setting toggle for `assembly_completion_mode` (admin only)

### New route `/assembly-approvals` (admin + manager only via `_authenticated/_admin`-style guard, or in-component role check)
Table columns: Job # · SO # · Customer · Product · Qty · Assembly ID · Completion Date · Actions (View Job · Complete Assembly)
Lists jobs where `status = 'pending_assembly_approval'`. Confirm dialog → calls `completeUnleashedAssembly`.

### Jobs UI
When production marks a job complete, set `status = 'pending_assembly_approval'` instead of fully done. Show new status badge. Add nav link to "Assembly Approvals" for admin/manager.

## Scheduled polling
pg_cron job every 5 minutes calls a new public route `src/routes/api/public/hooks/sync-fill-ready.ts` (verifies a `CRON_SECRET` header) which runs the same import logic via `supabaseAdmin`. Manual button on Sync page calls the auth'd server fn for ad-hoc runs.

## Out of scope (this turn)
- Automatic Completion mode (setting is stored but path not wired)
- Multi-line SOs creating multiple jobs (we use largest line; log others)
- Editing/cancelling imported jobs back in Unleashed

## Files touched
- New: `supabase/migrations/<ts>_fill_ready_workflow.sql`
- New: `src/lib/unleashed/sales-orders.functions.ts`
- New: `src/lib/unleashed/sales-orders.server.ts` (admin-mode importer used by cron route)
- New: `src/routes/assembly-approvals.tsx`
- New: `src/routes/api/public/hooks/sync-fill-ready.ts`
- Edit: `src/routes/unleashed-sync.tsx` (new card + setting)
- Edit: `src/routes/jobs.tsx` + job dialog (new status, route to approvals)
- Edit: `src/lib/types.ts` / job status enum
- Edit: `src/components/layout/AppShell.tsx` (nav entry, role-gated)
