import type { Job, JobStatus, Priority } from "./types";

export function runtimeHours(job: Job) {
  if (!job.bottlesPerHour) return 0;
  return job.quantity / job.bottlesPerHour;
}

export function runtimeMinutes(job: Job) {
  return Math.round(runtimeHours(job) * 60 + job.setupMinutes);
}

export function estimatedFinish(job: Job): Date {
  const start = new Date(job.scheduledStart);
  return new Date(start.getTime() + runtimeMinutes(job) * 60_000);
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
  const plannedStart = new Date(job.plannedStart ?? job.scheduledStart);
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

export function fmtDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtTime(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateTime(d: string | Date) {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
