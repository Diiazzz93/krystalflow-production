# Weekend-aware scheduling

Right now the calendar treats every day as a working day. When you drag a job's right edge across Saturday/Sunday, those days count as production time, which throws off duration and analytics. The fix is to treat Sat/Sun as non-working everywhere the schedule does date math, and to visually mark them as off.

## What changes (user-visible)

- **Drag / resize on the month grid**: dropping or extending a bar across a weekend skips Sat/Sun. A 3-day job dragged so it would land Fri→Sun becomes Fri + Mon + Tue. Extending the end edge by "2 days" past a Friday lands on Tuesday, not Sunday.
- **Cascade reschedule**: when a job pushes downstream jobs on the same line, the preserved gap is counted in working days, so downstream jobs also skip weekends.
- **Estimated finish (runtime → end time)**: the calculation that turns runtime hours into an end timestamp rolls over weekends instead of consuming them.
- **Weekend cells**: Sat/Sun cells in the month and week grids get a subtle striped/greyed background and a "Non-working" tooltip. Double-clicking a weekend cell to create a job snaps the new job to the next Monday and shows a small toast ("Weekends are non-working — moved to Mon …").
- **Drag indicator**: the "+N days" pill at the bottom of the screen says "+N working days" so it's clear weekends aren't counted.

## What does NOT change

- Day/week line-schedule view still renders weekend columns (so you can see history that already landed there), but new drags/resizes obey the weekend rule.
- No new setting — Sat/Sun is hard-coded as the weekend. If you later want custom non-working days (public holidays, a 6-day week, etc.), that's a follow-up.
- Existing jobs already scheduled on a weekend are left alone; only new moves/resizes/creates apply the rule.
- Analytics, QC, shipping, stock — untouched. They keep reading whatever timestamps the calendar stores; the fix is upstream of them.

## Technical notes

- New helpers in `src/lib/schedule.ts`:
  - `isWeekend(d)`, `nextWorkingDay(d)`, `addWorkingDays(d, n)` (handles negative n for resize-left), `workingDaysBetween(a, b)`.
- `cascadeReschedule` switched from raw `ms` gap math to working-day gap math, and the trigger's new start/end are snapped to working days before cascading.
- `CalendarView.tsx` `startDrag` `onUp`: use `addWorkingDays(origStart, daysDelta)` instead of `setDate(+daysDelta)`; same for `origEnd`. Snap any landing date that falls on a weekend to the next working day.
- `MonthGrid`: add `weekend` styling on the day cell when `d.getDay() === 0 || 6`; intercept double-click to snap.
- `src/lib/utils-domain.ts` `estimatedFinish`: walk forward in working-day chunks of `dailyHours` (default 8h, configurable later) instead of straight `+ms`. This keeps `jobEnd` consistent with the new rules.
- No DB changes, no new types.

## Open question

Do you want me to also **auto-fix existing jobs** whose current scheduled range crosses a weekend (one-time migration on load), or leave them as-is and only apply the rule going forward? Default in this plan is "leave existing as-is".
