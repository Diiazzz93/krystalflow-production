# Fix login getting stuck and resetting the form

## Root cause

Supabase Auth sign-in is succeeding (auth logs show HTTP 200), but immediately after sign-in the app calls `loadAuthUser()` which reads from `public.profiles` and `public.user_roles`. Both tables (plus `inventory_items` and `production_jobs`) were created with RLS policies but **no `GRANT` statements** for the `authenticated` role.

In Supabase, RLS alone is not enough — PostgREST also requires table-level `GRANT`s. Without them, every query returns a permission error before RLS is evaluated. `loadAuthUser` retries 4 times, throws, and the user state stays `null`. The `<AuthGate>` then re-renders `<LoginScreen>`, which mounts fresh and shows empty inputs — exactly the "gets rid of my name" symptom.

`private.has_role(...)` is also not `EXECUTE`-able by `authenticated`, which would break the admin-scoped policies once grants are added.

## Fix (single migration)

Add the missing grants. No app code changes needed.

```sql
-- Tables used by the signed-in user
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_jobs TO authenticated;

GRANT ALL ON public.profiles, public.user_roles,
             public.inventory_items, public.production_jobs
      TO service_role;

-- has_role is called from RLS policies running as the authenticated user
GRANT USAGE   ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
```

RLS policies already restrict rows correctly (own profile / own roles / admin overrides), so granting table-level CRUD to `authenticated` is safe.

## Verification

After the migration, sign in again — the loading screen should advance into the app instead of bouncing back to the empty login form.
