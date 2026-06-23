## Root cause

The BOM pull always returns 0 components because the Unleashed BOM line parser uses the wrong field names. The code reads `ComponentProduct` and `ComponentQuantity`, but Unleashed's `/BillOfMaterials` API actually returns `Product` and `Quantity` on each line. Every line gets parsed as `{ productCode: "", quantity: 0 }` and then dropped by the `.filter(c => c.productCode)` guard. No error is thrown — the user just sees "Pulled 0 components".

The same bug also corrupts the initial Sales Order import path, so even fresh jobs imported from Unleashed have empty `assemblyComponents` until a per-pallet Assembly link gets attached.

A temp "create-then-delete Assembly" workaround isn't needed — we already have the right data (the BOM); we're just parsing the wrong field names.

## Fix

Single file: `src/lib/unleashed/fill-ready.server.ts`

1. **`UnleashedBomLine` interface** (~lines 28-38) — rename:
   - `ComponentProduct` → `Product`
   - `ComponentQuantity` → `Quantity`

2. **SO importer** (~lines 178-184) — read `line.Product?.ProductCode`, `line.Product?.Guid`, `line.Quantity` instead of the `Component*` variants.

3. **`refreshJobBomComponentsImpl`** (~lines 388-395) — same field rename at the read site.

## Safety / UX touch-ups

- `refreshJobBomComponentsImpl`: if parsing yields 0 components from a non-empty `bomLines`, return `{ ok: false, error: "BOM returned no components (parse mismatch)" }` so silent failures surface as a toast in future.
- `JobStockDialog.tsx` auto-refresh catch: add a small `toast.error` (currently only `console.error`) so users see when the auto-pull fails on dialog open.

## Out of scope

- No changes to Assembly creation timing or any Unleashed writes.
- No temp-Assembly create/delete dance.
- Historical jobs already saved with empty `assemblyComponents` will repopulate the next time the dialog opens (auto-refresh triggers when components are empty) or via the manual "Pull from Unleashed BOM" button.

## Verification

1. Open the active IPA fill job → Stock tab → should auto-populate with real component rows scaled by carton qty.
2. Click "Pull from Unleashed BOM" → toast shows non-zero count.
3. Re-import a Sales Order → newly imported job's `assemblyComponents` is populated immediately.