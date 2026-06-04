## Goal
Shrink the Stock Alert Settings section so it stays compact even with hundreds of stock items, while keeping all current functionality (thresholds, reorder qty, supplier, notes, weekly email preview, role permissions).

## Approach
Replace the current stack of large per-item cards with a compact, scrollable table inside a fixed-height panel. Editing happens in a side drawer instead of inline expanded fields.

### Layout changes in `StockAlertsPanel.tsx`
1. **Collapsible section header** — wrap the whole panel in a collapsible card (open by default) so users can hide it entirely on the Settings page.
2. **Filters row** (single line):
   - Search input (existing)
   - Category filter dropdown (Bottle / Cap / Label / Carton / Liquid / Other)
   - Status filter (All / Needs attention / OK) — "Needs attention" = out / critical / low
   - "Preview weekly email" button (moved here)
3. **Compact table** replacing the card stack. Columns:
   - Status dot (red/orange/yellow/green)
   - Item (name + SKU muted below)
   - On hand
   - Low / Critical / Reorder qty (small inline numeric inputs, ~70px wide)
   - Supplier (small input)
   - Edit button (opens drawer for notes + full edit)
4. **Fixed max height** (e.g. `max-h-[520px] overflow-auto`) with sticky header so the section never dominates the Settings page.
5. **Bulk save bar** at the bottom of the table appears only when there are unsaved drafts: "3 items modified — Save all / Discard". Removes the per-row Save button noise.
6. **Edit drawer** (`Sheet` from shadcn) opens on row click or Edit button for full editing including the Notes textarea (which doesn't fit comfortably in a row).

### Files
- Edit `src/components/settings/StockAlertsPanel.tsx` — rewrite to table + drawer layout.
- New `src/components/settings/StockAlertEditDrawer.tsx` — sheet with full fields + notes.
- No DB changes, no changes to `stock-alerts.ts` or stock store.

## Result
- Section collapses to a single header row when not in use.
- When expanded, shows ~10 items per screen instead of ~2, in a fixed-height scroll area.
- Quick edits (thresholds, supplier) stay inline; deep edits (notes) move to a drawer.
- Bulk save replaces dozens of Save buttons.