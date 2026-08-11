import type { Job, JobStatus, Priority } from "./types";

export function runtimeHours(job: Job) {
  if (!job.bottlesPerHour) return 0;
  return job.quantity / job.bottlesPerHour;
}

export function runtimeMinutes(job: Job) {
  return Math.round(runtimeHours(job) * 60 + job.setupMinutes);
}

export function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function nextWorkingDay(d: Date) {
  const x = new Date(d);
  while (isWeekend(x)) x.setDate(x.getDate() + 1);
  return x;
}

export function addWorkingDays(d: Date, n: number) {
  const x = new Date(d);
  if (n === 0) return x;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    x.setDate(x.getDate() + step);
    if (!isWeekend(x)) remaining--;
  }
  return x;
}

export function workingDaysBetween(a: Date, b: Date) {
  const start = new Date(a); start.setHours(0, 0, 0, 0);
  const end = new Date(b); end.setHours(0, 0, 0, 0);
  if (start.getTime() === end.getTime()) return 0;
  const sign = end > start ? 1 : -1;
  let count = 0;
  const cur = new Date(start);
  while (cur.getTime() !== end.getTime()) {
    cur.setDate(cur.getDate() + sign);
    if (!isWeekend(cur)) count += sign;
  }
  return count;
}

export function estimatedFinish(job: Job): Date {
  const startMs = job.scheduledStart ? new Date(job.scheduledStart).getTime() : Date.now();
  let remainingMs = runtimeMinutes(job) * 60_000;
  let cur = new Date(startMs);
  // Guard against infinite loops on bad data
  let safety = 0;
  while (remainingMs > 0 && safety++ < 3650) {
    if (isWeekend(cur)) {
      const midnight = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
      cur = nextWorkingDay(new Date(midnight.getTime() + 24 * 60 * 60 * 1000));
      cur.setHours(0, 0, 0, 0);
      continue;
    }
    const endOfDay = new Date(cur);
    endOfDay.setHours(24, 0, 0, 0);
    const slice = Math.min(remainingMs, endOfDay.getTime() - cur.getTime());
    cur = new Date(cur.getTime() + slice);
    remainingMs -= slice;
  }
  return cur;
}

export function jobEnd(job: Job): Date {
  if (job.scheduledEnd) return new Date(job.scheduledEnd);
  return estimatedFinish(job);
}

export type PerfStatus = "early" | "on-time" | "late" | "pending";

export interface JobPerformance {
  plannedStart: Date;
  plannedEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  plannedMs: number;
  actualMs: number | null;
  diffMs: number | null; // actual - planned (positive = late)
  status: PerfStatus;
}

const ON_TIME_TOLERANCE_MS = 30 * 60_000; // ±30 min counts as on-time

export function getJobPerformance(job: Job): JobPerformance {
  const plannedStart = new Date(job.plannedStart ?? job.scheduledStart ?? Date.now());
  const plannedEnd = new Date(job.plannedEnd ?? job.scheduledEnd ?? estimatedFinish(job));
  const actualStart = job.actualStart ? new Date(job.actualStart) : null;
  const actualEnd = job.actualEnd ? new Date(job.actualEnd) : null;
  const plannedMs = Math.max(0, plannedEnd.getTime() - plannedStart.getTime());
  const actualMs =
    actualStart && actualEnd ? Math.max(0, actualEnd.getTime() - actualStart.getTime()) : null;
  const diffMs = actualEnd ? actualEnd.getTime() - plannedEnd.getTime() : null;
  let status: PerfStatus = "pending";
  if (diffMs !== null) {
    if (diffMs < -ON_TIME_TOLERANCE_MS) status = "early";
    else if (diffMs > ON_TIME_TOLERANCE_MS) status = "late";
    else status = "on-time";
  }
  return { plannedStart, plannedEnd, actualStart, actualEnd, plannedMs, actualMs, diffMs, status };
}

export function fmtDurationMs(ms: number) {
  const abs = Math.abs(ms);
  const h = abs / 3_600_000;
  if (h >= 24) {
    const d = h / 24;
    return `${d.toFixed(d >= 10 ? 0 : 1)}d`;
  }
  if (h >= 1) return `${h.toFixed(h >= 10 ? 0 : 1)}h`;
  const m = Math.round(abs / 60_000);
  return `${m}m`;
}

export function progressPct(job: Job) {
  if (!job.quantity) return 0;
  return Math.min(100, Math.round((job.bottlesCompleted / job.quantity) * 100));
}

/** Original order quantity (boxes/bottles) — falls back to job.quantity for non-imported jobs. */
export function originalQuantity(job: Job): number {
  return Math.max(0, job.originalQuantity ?? job.quantity ?? 0);
}

export function originalPallets(job: Job): number {
  // Imported jobs land with originalPallets = 1 until the real pallet count is
  // worked out on the job, so always take the larger of the two.
  return Math.max(0, job.originalPallets ?? 0, job.pallets ?? 0);
}

export function completedQuantity(job: Job): number {
  return Math.max(0, job.completedQuantity ?? 0);
}

export function completedPallets(job: Job): number {
  return Math.max(0, job.completedPallets ?? job.palletsCompleted ?? 0);
}

export function remainingQuantity(job: Job): number {
  return Math.max(0, originalQuantity(job) - completedQuantity(job));
}

export function remainingPallets(job: Job): number {
  return Math.max(0, originalPallets(job) - completedPallets(job));
}

export function progressPalletPct(job: Job): number {
  const total = originalPallets(job);
  if (!total) return 0;
  return Math.min(100, Math.round((completedPallets(job) / total) * 100));
}


export const STATUS_COLORS: Record<JobStatus, string> = {
  Scheduled: "bg-slate-500 text-white",
  Setup: "bg-amber-500 text-white",
  Filling: "bg-sky-500 text-white",
  Capping: "bg-indigo-500 text-white",
  Labelling: "bg-violet-500 text-white",
  Packing: "bg-fuchsia-500 text-white",
  "QC Review": "bg-yellow-500 text-black",
  Complete: "bg-emerald-600 text-white",
  "Pending Assembly Approval": "bg-cyan-600 text-white",
  "Assembly Completed": "bg-teal-600 text-white",
  Delayed: "bg-orange-600 text-white",
  "On Hold": "bg-zinc-500 text-white",
  "Requires Review": "bg-red-600 text-white",
};

export const STATUS_DOT: Record<JobStatus, string> = {
  Scheduled: "bg-slate-500",
  Setup: "bg-amber-500",
  Filling: "bg-sky-500",
  Capping: "bg-indigo-500",
  Labelling: "bg-violet-500",
  Packing: "bg-fuchsia-500",
  "QC Review": "bg-yellow-500",
  Complete: "bg-emerald-600",
  "Pending Assembly Approval": "bg-cyan-600",
  "Assembly Completed": "bg-teal-600",
  Delayed: "bg-orange-600",
  "On Hold": "bg-zinc-500",
  "Requires Review": "bg-red-600",
};

export const ALL_STATUSES: JobStatus[] = [
  "Scheduled",
  "Setup",
  "Filling",
  "Capping",
  "Labelling",
  "Packing",
  "QC Review",
  "Complete",
  "Pending Assembly Approval",
  "Assembly Completed",
  "Delayed",
  "On Hold",
  "Requires Review",
];

export const ACTIVE_STATUSES: JobStatus[] = [
  "Setup",
  "Filling",
  "Capping",
  "Labelling",
  "Packing",
  "QC Review",
];

export const PRIORITIES: Priority[] = ["Low", "Normal", "High", "Urgent"];

export const PRIORITY_COLOR: Record<Priority, string> = {
  Low: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  Normal: "bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
  High: "bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  Urgent: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
};

export function fmtDate(d: string | Date | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtTime(d: string | Date | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateTime(d: string | Date | undefined) {
  if (!d) return "—";
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
