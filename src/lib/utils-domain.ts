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
