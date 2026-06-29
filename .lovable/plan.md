## Manual job completion

Add a way for operators/managers/admins to manually finish a job, with a confirmation when it's being closed short of the planned pallets.

### Where the button appears
- **Job dialog** (`src/components/jobs/JobDialog.tsx`) — primary location. New **Mark complete** button in the footer, next to existing actions. Hidden when the job is already `Complete` or `Cancelled`.
- **Live Board** (`src/routes/live.tsx`) — small **Complete** action on the active job card so the line lead can finish without opening the dialog.

### Behavior
- If `completedPallets >= originalPallets` → mark complete immediately, no confirm.
- If `completedPallets < originalPallets` → open a confirm dialog:
  - Title: "Finish job short?"
  - Body: "X of Y pallets done (Z bottles of W). This will close the job as Complete and stop it appearing on the Live Board. Continue?"
  - Buttons: **Cancel** / **Finish short**.
- On confirm, call a new `completeJob(jobId, { short: boolean })` in `src/lib/store.tsx` that sets `status: "Complete"` and stamps `completedAt = now()`. It does **not** delete the job, does **not** alter QC records, and does **not** inflate `completedPallets`/`bottlesCompleted` — those keep their real values so analytics stay accurate.
- Existing auto-complete on full QC remains unchanged.

### Permissions
Uses existing `canEditJobs` permission from `src/lib/auth.tsx` — Admin, Manager, and Operator can complete (Operator already updates job progress today). Viewer and Pending cannot see the button.

### Live Board / lists
- Live Board already filters out `Complete` jobs, so a manually completed job drops off immediately.
- Jobs page keeps showing it under completed/history as today (no deletion).

### Files touched
- `src/lib/store.tsx` — add `completeJob` action.
- `src/components/jobs/JobDialog.tsx` — button + confirm dialog.
- `src/routes/live.tsx` — small complete action on active job card.
- `src/lib/auth.tsx` — no change (reuse `canEditJobs`).

No database migration needed — uses existing `status` and `completedAt` columns on `production_jobs`.
