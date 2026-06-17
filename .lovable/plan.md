## Goal
Let the user take a job off the calendar without deleting the job record. The job stays in the Jobs list and can be re-scheduled later.

## How it works
A job appears on the calendar only when it has a `scheduledStart`. "Unscheduling" = clearing `scheduledStart` and `scheduledEnd` on the job, leaving everything else (customer, qty, status, QC, etc.) intact.

## UX
Add an **"Unschedule"** action in two places:

1. **On the calendar bar** — right-click (context menu) on any job bar shows:
   - Open job
   - Unschedule (remove from calendar)
   
   Plus a small `×` icon button on hover in the top-right of the bar as a discoverable shortcut.

2. **Inside the Job dialog** — a secondary "Remove from calendar" button next to Save, visible only when the job currently has a scheduled date. This keeps parity with users who open jobs from the Jobs page.

Both actions:
- Call `updateJob(id, { scheduledStart: undefined, scheduledEnd: undefined })`
- Show a toast: "Job unscheduled" with an **Undo** action that restores the previous dates.
- Do NOT touch status — a "Scheduled" job that's unscheduled stays "Scheduled" so the user can spot it in the Jobs list and re-drop it.

Delete (full removal) stays where it already is and is unchanged.

## Technical notes
- `src/components/calendar/CalendarView.tsx`: wrap the bar in a shadcn `ContextMenu`; add hover `×` button; wire to a new `handleUnschedule(jobId)` helper that captures previous dates for undo.
- `src/components/jobs/JobDialog.tsx`: add the "Remove from calendar" button, gated on `job.scheduledStart`.
- No schema, store, or type changes — `scheduledStart`/`scheduledEnd` are already optional on `Job` and the store already persists `undefined` correctly via `jobToRow`.