## Goal
New sign-ups should land in a "waiting for admin approval" state and have no access to the app until an admin assigns them a real role.

## Changes

### 1. Database (migration)
- Add `'pending'` value to the `app_role` enum.
- Update `handle_new_user()` trigger so non-first users get `role = 'pending'` (instead of `'viewer'`). First-ever user still becomes `'admin'`.
- Leave existing users untouched.

### 2. Auth gate
- In `src/routes/_authenticated/route.tsx` (or a small wrapper if the file is integration-managed), after the session check, fetch the current user's roles.
  - If the user has only `'pending'` (or no roles), render a **"Pending approval"** screen instead of `<Outlet />`. The screen shows: "Your account is awaiting admin approval. Please contact your administrator." plus a Sign out button.
  - Otherwise render the app normally.
- This blocks pending users from every protected page in one place — no per-route changes needed.

### 3. User Management UI (`UserManagementPanel.tsx`)
- Show pending users with a distinct **"Pending"** badge at the top of the list.
- Role dropdown already lets admin assign a real role — once changed away from `pending`, the user gains access on next navigation.
- Invite form: default selected role stays **Viewer** (per your answer).

### 4. Role helpers (`src/lib/auth.tsx`)
- Add `'pending'` to the `Role` type.
- Treat `'pending'` as no permissions everywhere (it should never satisfy `hasRole`/`hasAnyRole` checks for real roles).

## Out of scope
- No email notification to admins on new sign-up (can be added later if you want).
- No changes to invite flow — admin-invited users still get whatever role the admin picks.

## Files touched
- New migration (enum + trigger update)
- `src/routes/_authenticated/route.tsx` or a new `PendingApprovalGate` component
- `src/components/.../UserManagementPanel.tsx`
- `src/lib/auth.tsx`
