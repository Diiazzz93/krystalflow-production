import type { Job } from "./types";
import { jobEnd } from "./utils-domain";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleChange {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
}

/**
 * Cascade reschedule on a single production line.
 *
 * Given the moved/resized job's new start/end, push or pull all subsequent
 * jobs on the same line so that the original gap between consecutive jobs
 * is preserved. Jobs never overlap; intentional gaps remain intact.
 *
 * Returns the list of changed jobs (including the trigger job).
 */
export function cascadeReschedule(
  jobs: Job[],
  triggerId: string,
  newStartISO: string,
  newEndISO: string,
): ScheduleChange[] {
  const trigger = jobs.find((j) => j.id === triggerId);
  if (!trigger) return [];

  // Snapshot original timings for ALL jobs on this line BEFORE applying the change.
  const lineJobsOriginal = jobs
    .filter((j) => j.line === trigger.line)
    .map((j) => ({
      job: j,
      origStart: new Date(j.scheduledStart).getTime(),
      origEnd: jobEnd(j).getTime(),
    }))
    .sort((a, b) => a.origStart - b.origStart);

  const triggerIdx = lineJobsOriginal.findIndex((x) => x.job.id === triggerId);
  if (triggerIdx === -1) return [];

  const changes: ScheduleChange[] = [];

  // Apply the trigger change.
  const newStart = new Date(newStartISO).getTime();
  let prevEnd = new Date(newEndISO).getTime();
  changes.push({
    id: triggerId,
    scheduledStart: new Date(newStart).toISOString(),
    scheduledEnd: new Date(prevEnd).toISOString(),
  });

  // Walk subsequent jobs; preserve the ORIGINAL gap relative to the previous job.
  let prevOrigEnd = lineJobsOriginal[triggerIdx].origEnd;
  for (let i = triggerIdx + 1; i < lineJobsOriginal.length; i++) {
    const cur = lineJobsOriginal[i];
    const origGap = cur.origStart - prevOrigEnd; // can be 0 or positive
    const duration = cur.origEnd - cur.origStart;
    const nextStart = prevEnd + Math.max(0, origGap);
    const nextEnd = nextStart + duration;
    changes.push({
      id: cur.job.id,
      scheduledStart: new Date(nextStart).toISOString(),
      scheduledEnd: new Date(nextEnd).toISOString(),
    });
    prevEnd = nextEnd;
    prevOrigEnd = cur.origEnd;
  }

  // Drop entries that didn't actually change (avoid noisy updates).
  return changes.filter((c) => {
    const j = jobs.find((x) => x.id === c.id)!;
    return (
      c.scheduledStart !== j.scheduledStart ||
      c.scheduledEnd !== (j.scheduledEnd ?? jobEnd(j).toISOString())
    );
  });
}

export { DAY_MS };
