## Goal

Stop "out of stock" warnings from blaring on finished/boxed products (which are made-to-order and will always read 0 until a production run is bottled). Instead, recognise them as a separate class of stock — identified by their Unleashed **Product Group** — and show them in their own "Made to order" section away from the raw-material reorder alerts.

## How items get classified

1. **Track the Unleashed Product Group on every item.**
   - Add a nullable `unleashed_group` column to `inventory_items`.
   - When importing or syncing from Unleashed, write `p.ProductGroup?.GroupName` into this column (import path in `src/routes/unleashed-sync.tsx`, and the live-sync paths in `src/routes/stock.tsx` / `src/lib/stock-store.tsx`).
   - Backfill: on next sync existing rows get populated automatically; no manual data fix needed.

2. **Settings: "Finished-goods product groups" picker.**
   - In **Settings → Stock alerts** (`src/components/settings/StockAlertsPanel.tsx`) add a multi-select that lists every Unleashed Product Group (uses the same `client.fetchProductGroups()` call already used on the Unleashed Sync page).
   - The selection persists in `app_settings` under a new key `stock.finished_goods_groups` (array of group names) via the existing `app-settings-kv` helper, so it syncs across devices.
   - A small hook `useFinishedGoodsGroups()` exposes the live set to any component that needs it.

## How they're shown

3. **Stock alerts split into two buckets.**
   Update `src/lib/stock-alerts.ts` so `getAlertItems()` returns `{ reorderAlerts, madeToOrder }` instead of a single list. An item lands in `madeToOrder` whenever its `unleashed_group` is in the finished-goods set; everything else stays in `reorderAlerts`. Status colours/badges are unchanged inside each bucket.

4. **UI surfaces that need the split:**
   - **`StockAlertsCard`** (dashboard) — keep the red "Out / Critical / Low" tiles for `reorderAlerts` only. Add a muted "Made to order — produced on demand" section underneath with a count and a collapsible list. No red colour, no "action needed" tone.
   - **`LowStockReportDialog`** — same split: a primary "Needs reordering" section, then a collapsed "Made to order" section.
   - **Stock page list** (`src/routes/stock.tsx`) — items in finished-goods groups render with a neutral "Made to order" badge instead of the amber/red `low-stock` / `out-of-stock` row tint. The status filter dropdown gains a "Made to order" option.
   - **Weekly email** (`buildWeeklyEmailHtml`) — exclude finished-goods from the alert tables entirely; optionally append a small "Made to order (not counted as alerts)" footer with the count. They never trigger the "needs reordering" tone of the email.

## Technical details

- **Migration:**
  ```sql
  ALTER TABLE public.inventory_items ADD COLUMN unleashed_group text;
  CREATE INDEX inventory_items_unleashed_group_idx ON public.inventory_items (unleashed_group);
  ```
  No new policies/grants needed — column inherits existing RLS on `inventory_items`.

- **Settings key:** `stock.finished_goods_groups` → `string[]`, written via the existing `app_settings` KV pattern (so the tablet sees the same selection as the desktop preview).

- **Type updates:** add `unleashedGroup?: string` to `StockItem` in `src/lib/stock.ts` / `src/lib/types.ts` and map it in `stock-store.tsx`'s `rowToItem` / `addItem` / `updateItem`.

- **No change** to the existing `low-stock` / `critical-stock` / `out-of-stock` status calculation — finished-goods items still *have* a status, they're just routed to the "Made to order" bucket before the alert UI sees them.

## What this does NOT change

- The Unleashed sync itself (`StockOnHand`, BOM pull, allocations) keeps working exactly as it does now.
- Production jobs still see the real `availableStock` numbers when checking whether a finished SKU can be shipped — only the *alert/warning UI* is suppressed.
- Raw materials (bottles, caps, labels, cartons, liquid) still raise alerts normally.
