import type { Job } from "./types";
import { jobEnd, workingDaysBetween, addWorkingDays } from "./utils-domain";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleChange {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
}

function midnight(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Cascade reschedule on a single production line, weekend-aware.
 *
 * Shifts every downstream job on the same line by the same number of working
 * days that the trigger's end-date moved. Time-of-day is preserved; overlaps
 * are nudged forward.
 */
export function cascadeReschedule(
  jobs: Job[],
  triggerId: string,
  newStartISO: string,
  newEndISO: string,
): ScheduleChange[] {
  const trigger = jobs.find((j) => j.id === triggerId);
  if (!trigger) return [];

  const lineJobs = jobs
    .filter((j) => j.line === trigger.line && j.scheduledStart)
    .sort(
      (a, b) =>
        new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime(),
    );
  const triggerIdx = lineJobs.findIndex((j) => j.id === triggerId);
  if (triggerIdx === -1) return [];

  const origEnd = jobEnd(trigger);
  const newEnd = new Date(newEndISO);
  const deltaDays = workingDaysBetween(midnight(origEnd), midnight(newEnd));

  const changes: ScheduleChange[] = [
    { id: triggerId, scheduledStart: newStartISO, scheduledEnd: newEndISO },
  ];

  let prevEnd = newEnd;
  for (let i = triggerIdx + 1; i < lineJobs.length; i++) {
    const cur = lineJobs[i];
    const origStart = new Date(cur.scheduledStart!);
    const origEndCur = jobEnd(cur);
    const duration = origEndCur.getTime() - origStart.getTime();

    const shifted = addWorkingDays(origStart, deltaDays);
    const nextStart = new Date(shifted);
    nextStart.setHours(
      origStart.getHours(),
      origStart.getMinutes(),
      origStart.getSeconds(),
      origStart.getMilliseconds(),
    );

    const finalStart = nextStart < prevEnd ? new Date(prevEnd) : nextStart;
    const finalEnd = new Date(finalStart.getTime() + duration);

    changes.push({
      id: cur.id,
      scheduledStart: finalStart.toISOString(),
      scheduledEnd: finalEnd.toISOString(),
    });
    prevEnd = finalEnd;
  }

  return changes.filter((c) => {
    const j = jobs.find((x) => x.id === c.id)!;
    return (
      c.scheduledStart !== j.scheduledStart ||
      c.scheduledEnd !== (j.scheduledEnd ?? jobEnd(j).toISOString())
    );
  });
}

export { DAY_MS };
