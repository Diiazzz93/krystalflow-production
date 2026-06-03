# Plan: Connect KrystalFlow to Supabase

The app already has Supabase Auth wired (LoginScreen, AuthProvider, `profiles` + `user_roles` tables, `private.has_role`). Sign in / sign out / refresh / role-gated routes already work. So items **1 and 2 are already done** — I'll verify and only patch gaps (e.g. add a route guard if missing, surface role errors).

The real work is moving **stock** and **jobs** off `localStorage` onto Supabase, behind RLS, while keeping the existing UI and the dark theme intact.

## Phase 1 — Verify what's already there (no code)

- Confirm `AuthProvider` + `LoginScreen` flow works (already in `src/lib/auth.tsx`).
- Confirm protected routes redirect to login (check `__root.tsx`). Patch if missing.
- No DB changes needed for auth/roles — already done in earlier migration.

## Phase 2 — Database schema (one migration)

Create two tables with full GRANTs + RLS:

**`public.inventory_items`** — id, sku, name, category (enum or text), quantity_on_hand, allocated_stock, available_stock (generated), unit, location, reorder_level, source, notes, date_received, last_updated, created_at.

**`public.production_jobs`** — id, customer, product, sku, bottle_sku, cap_sku, label_sku, carton_sku, liquid_sku, quantity, bottles_per_carton, scheduled_start, scheduled_end, status, operator, line_id, notes, created_by, created_at, updated_at.

RLS policies (using existing `private.has_role`):
- **inventory_items**: SELECT for all authenticated; INSERT/UPDATE/DELETE for admin + manager only.
- **production_jobs**: SELECT for all authenticated; INSERT/UPDATE for admin + manager; operators can UPDATE status/progress only (via column-scoped policy or trigger); DELETE admin/manager only.

GRANTs to `authenticated` + `service_role` (no `anon`).

`updated_at` trigger using existing `public.set_updated_at()`.

## Phase 3 — Stock store → Supabase

Replace `src/lib/stock-store.tsx` `localStorage` impl with a Supabase-backed store using TanStack Query (`useQuery(['stock'])` + mutations). Keep the same hook API (`useStockStore` returning `{ items, addItem, updateItem }`) so call sites (`AddStockDialog`, `JobDialog`, `JobStockCheck`, `JobStockDialog`, `ActiveJobsSection`, stock route) don't need to change. `MOCK_STOCK` becomes seed-only (one-time insert when table empty, gated to admin).

Show loading skeletons + error toast + success toast on add.

## Phase 4 — Jobs store → Supabase

Replace `src/lib/store.tsx` `localStorage` for jobs with a Supabase-backed equivalent (still a React context exposing `jobs`, `addJob`, `updateJob`, `deleteJob`). QC entries and Lines stay in localStorage for now (out of scope per request — request only names jobs + inventory). Keep the same hook API so all routes/components keep working.

Toasts on save/error; loading state while initial fetch resolves.

## Phase 5 — Wire it up & verify

- Verify no component imports changed.
- Confirm dropdowns in JobDialog pull from live Supabase stock.
- Confirm stock added on Stock page immediately appears in job comboboxes (Query cache invalidation).
- Confirm a fresh login + refresh keeps jobs/stock visible (from DB, not localStorage).
- Keep dark theme + existing layouts untouched.

## Technical notes

- **Client-side only** Supabase calls (`@/integrations/supabase/client`) — no server functions needed for this round; RLS enforces access.
- **TanStack Query** for cache; mutations call `queryClient.invalidateQueries(['stock'])` / `['jobs']`.
- **No edge functions, no service-role calls** from the client.
- **Seeding**: on first load by an admin, if `inventory_items` is empty, seed from `MOCK_STOCK`. Jobs are NOT auto-seeded (avoid polluting real data); user can press existing "Reset" if needed (we'll repurpose it to clear DB jobs — admin only).
- QC entries, Lines, customer specs, line-setups, branding — **out of scope** this round (still localStorage). I'll note this in the final message.

## Out of scope (will mention to user)
- Migrating QC entries, lines, customer specs, line-setups to Supabase.
- Operator column-level write restrictions on jobs (basic role gate only; finer-grained later).
- Realtime subscriptions (can add next).