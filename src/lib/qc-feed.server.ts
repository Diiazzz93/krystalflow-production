// Read-only shaping and loading for GET /api/public/hooks/qc-feed.
// Callers must already have checked QC_FEED_SECRET. This module only selects.
// Every saved pallet_qc_records row in the time window is returned, plus every
// qc_pallet_drafts row (a form saved with "Save part pallet"). A form that
// only exists in the tablet session is not in either table.
//
// resumed_from is taken from data.resumedFrom when that text is present.
// Resume reopens the same part-pallet row and finish keeps that same id,
// so nothing writes a different earlier form id today and the field is null.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isCompletePalletRow } from "@/lib/qc-validation";

export const QC_FEED_LIMIT = 500;

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_PAYLOAD = /data:image|;base64,|data:application\/octet-stream/i;

/**
 * Columns plus named JSON keys. Aliases keep supervisorSignatureDataUrl and
 * every other data field off the wire.
 */
const QC_JSON_FIELDS = [
  "qc_approved:data->>qcApproved",
  "supervisor_name:data->>supervisorName",
  "supervisor_signoff:data->>supervisorSignoff",
  "m_number:data->>mNumber",
  "pallet_quantity:data->>palletQuantity",
  "pallet_type:data->>palletType",
  "notes:data->>notes",
  "log_date:data->>logDate",
  "title:data->>title",
  // JSON, not text, so the row list stays an array. The signature drawing is not selected.
  "pallet_row_volumes:data->palletRowVolumes",
  "resumed_from:data->>resumedFrom",
  "is_part_pallet:data->>isPartPallet",
].join(",");

const QC_SELECT = [
  "id",
  "job_id",
  "pallet_code",
  "pallet_number",
  "result",
  "operator_name",
  "created_at",
  "updated_at",
  QC_JSON_FIELDS,
].join(",");

// Part pallets have no created_at, result, or pallet code column. The operator
// name lives in the saved form values. updated_at is the last save time.
const DRAFT_SELECT = [
  "id",
  "job_id",
  "pallet_number",
  "updated_at",
  "operator_name:data->>operatorName",
  QC_JSON_FIELDS,
].join(",");

const JOB_SELECT = "id, customer, product, sku, line, unleashed_sales_order_number";

export type QcFeedJob = {
  id: string;
  customer: string;
  product: string;
  sku: string;
  line: string;
  unleashed_sales_order_number: string | null;
};

export type QcFeedItem = {
  id: string;
  pallet_code: string;
  pallet_number: number;
  result: string;
  approved: boolean;
  flagged: boolean;
  operator_name: string | null;
  supervisor_name: string | null;
  m_number: string | null;
  pallet_quantity: number | null;
  pallet_type: string | null;
  notes: string | null;
  log_date: string | null;
  created_at: string;
  updated_at: string;
  title: string | null;
  is_part_pallet: boolean;
  rows_completed: number | null;
  resumed_from: string | null;
  job: QcFeedJob | null;
};

export type QcFeedResponse = {
  generated_at: string;
  since: string;
  until: string | null;
  count: number;
  items: QcFeedItem[];
  next_since: string;
};

export class QcFeedQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QcFeedQueryError";
  }
}

/** Accept an ISO-8601 timestamp and return the trimmed text, or null. */
export function parseIsoTimestamp(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!ISO_TIMESTAMP.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return value;
}

export function buildQcFeedResponse(args: {
  since: string;
  until: string | null;
  items: QcFeedItem[];
  generatedAt?: string;
}): QcFeedResponse {
  const last = args.items.at(-1);
  return {
    generated_at: args.generatedAt ?? new Date().toISOString(),
    since: args.since,
    until: args.until,
    count: args.items.length,
    items: args.items,
    next_since: last?.created_at ?? args.since,
  };
}

type JobRow = {
  id: string;
  customer: string;
  product: string;
  sku: string;
  line: string;
  unleashed_sales_order_number: string | null;
};

export async function loadCompletedQcFeed(
  supabase: SupabaseClient<Database>,
  window: { since: string; until: string | null },
): Promise<QcFeedItem[]> {
  let query = supabase
    .from("pallet_qc_records")
    .select(QC_SELECT)
    .gt("created_at", window.since)
    .order("created_at", { ascending: true })
    .limit(QC_FEED_LIMIT);

  if (window.until) {
    query = query.lte("created_at", window.until);
  }

  const { data, error } = await query;
  if (error) {
    throw new QcFeedQueryError(error.message);
  }

  const records = (data ?? []) as unknown as Record<string, unknown>[];
  const drafts = (await loadPartPalletRows(supabase, window)).map(asPartPalletFeedRow);
  const rows = takeQcFeedPage(records, drafts);
  const jobIds = uniqueJobIds(rows);
  const jobsById = await loadJobs(supabase, jobIds);

  return rows.map((row) => shapeQcFeedItem(row, jobsById));
}

async function loadPartPalletRows(
  supabase: SupabaseClient<Database>,
  window: { since: string; until: string | null },
): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from("qc_pallet_drafts")
    .select(DRAFT_SELECT)
    .gt("updated_at", window.since)
    .order("updated_at", { ascending: true })
    .limit(QC_FEED_LIMIT);

  if (window.until) {
    query = query.lte("updated_at", window.until);
  }

  const { data, error } = await query;
  if (error) {
    throw new QcFeedQueryError(error.message);
  }
  return (data ?? []) as unknown as Record<string, unknown>[];
}

function asPartPalletFeedRow(row: Record<string, unknown>): Record<string, unknown> {
  const savedAt = row.updated_at;
  return {
    ...row,
    // The draft table is the saved state of "Save part pallet".
    is_part_pallet: true,
    created_at: savedAt,
    updated_at: savedAt,
    pallet_code: typeof row.pallet_code === "string" ? row.pallet_code : "",
    result: typeof row.result === "string" ? row.result : "",
  };
}

/**
 * Oldest 500 across submitted forms and part pallets.
 * With no part pallets, the submitted page is returned unchanged.
 * When a source hits the 500 cap, items after that source's last
 * timestamp wait for the next page so an earlier form is not skipped.
 */
export function takeQcFeedPage(
  records: Record<string, unknown>[],
  drafts: Record<string, unknown>[],
): Record<string, unknown>[] {
  const recordIds = new Set(records.map((row) => String(row.id)));
  const extraDrafts = drafts.filter((row) => !recordIds.has(String(row.id)));
  if (extraDrafts.length === 0) return records;

  const tagged = [
    ...records.map((row, index) => ({ row, index })),
    ...extraDrafts.map((row, index) => ({ row, index: records.length + index })),
  ];
  tagged.sort((a, b) => {
    const diff = feedTime(a.row) - feedTime(b.row);
    if (Number.isFinite(diff) && diff !== 0) return diff;
    return a.index - b.index;
  });

  const horizon = pageHorizon(records, drafts);
  const pool = tagged.filter((item) => feedTime(item.row) <= horizon).map((item) => item.row);
  return pool.slice(0, QC_FEED_LIMIT);
}

function pageHorizon(
  records: Record<string, unknown>[],
  drafts: Record<string, unknown>[],
): number {
  const times: number[] = [];
  if (records.length >= QC_FEED_LIMIT) times.push(feedTime(records[records.length - 1]));
  if (drafts.length >= QC_FEED_LIMIT) times.push(feedTime(drafts[drafts.length - 1]));
  const finite = times.filter((time) => Number.isFinite(time));
  if (finite.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...finite);
}

function feedTime(row: Record<string, unknown>): number {
  return typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
}

function uniqueJobIds(rows: Record<string, unknown>[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const jobId = typeof row.job_id === "string" ? row.job_id.trim() : "";
    if (UUID_TEXT.test(jobId)) ids.add(jobId);
  }
  return [...ids];
}

async function loadJobs(
  supabase: SupabaseClient<Database>,
  jobIds: string[],
): Promise<Map<string, QcFeedJob>> {
  const jobsById = new Map<string, QcFeedJob>();
  if (jobIds.length === 0) return jobsById;

  const { data, error } = await supabase
    .from("production_jobs")
    .select(JOB_SELECT)
    .in("id", jobIds);

  if (error) {
    throw new QcFeedQueryError(error.message);
  }

  for (const row of (data ?? []) as JobRow[]) {
    jobsById.set(row.id.toLowerCase(), {
      id: row.id,
      customer: row.customer ?? "",
      product: row.product ?? "",
      sku: row.sku ?? "",
      line: row.line ?? "",
      unleashed_sales_order_number: blankToNull(row.unleashed_sales_order_number),
    });
  }
  return jobsById;
}

export function shapeQcFeedItem(
  row: Record<string, unknown>,
  jobsById: Map<string, QcFeedJob>,
): QcFeedItem {
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new QcFeedQueryError("QC row is missing id");
  }
  if (typeof row.created_at !== "string" || typeof row.updated_at !== "string") {
    throw new QcFeedQueryError("QC row is missing timestamps");
  }

  const result = typeof row.result === "string" ? row.result : "";
  const jobId = typeof row.job_id === "string" ? row.job_id.trim() : "";
  const job = UUID_TEXT.test(jobId) ? (jobsById.get(jobId.toLowerCase()) ?? null) : null;
  const supervisorName = readText(pickJson(row, "supervisor_name", "supervisorName"), "blank-null");
  const supervisorSignoff = readText(
    pickJson(row, "supervisor_signoff", "supervisorSignoff"),
    "blank-null",
  );
  // Sign-off the QC history actually shows is the supervisor's name.
  // qcApproved is only true when a Pass also has a signature drawing, and
  // Submit does not require that drawing, so a false or missing flag does
  // not mean the form was left unfinished.
  const approved =
    readApproved(pickJson(row, "qc_approved", "qcApproved")) ||
    supervisorName != null ||
    supervisorSignoff != null;
  const flagged = result === "Fail";
  const palletCode = readText(row.pallet_code, "keep");

  const item: QcFeedItem = {
    id: row.id,
    pallet_code: palletCode ?? "",
    pallet_number: readPalletNumber(row.pallet_number),
    result,
    approved,
    flagged,
    operator_name: readText(row.operator_name, "blank-null"),
    supervisor_name: supervisorName ?? supervisorSignoff,
    m_number: readText(pickJson(row, "m_number", "mNumber"), "blank-null"),
    pallet_quantity: readQuantity(pickJson(row, "pallet_quantity", "palletQuantity")),
    pallet_type: readText(pickJson(row, "pallet_type", "palletType"), "blank-null"),
    notes: readText(pickJson(row, "notes", "notes"), "keep"),
    log_date: readText(pickJson(row, "log_date", "logDate"), "blank-null"),
    created_at: row.created_at,
    updated_at: row.updated_at,
    title: job ? null : readText(pickJson(row, "title", "title"), "blank-null"),
    is_part_pallet: readPartPallet(row),
    rows_completed: countCompletedRows(pickJson(row, "pallet_row_volumes", "palletRowVolumes")),
    resumed_from: readResumedFrom(row),
    job,
  };

  if (hasForbiddenKey(item)) {
    throw new QcFeedQueryError("QC feed refused to include an image field");
  }
  return item;
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (/signature|dataurl|base64/i.test(key)) return true;
    if (hasForbiddenKey(child)) return true;
  }
  return false;
}

function pickJson(row: Record<string, unknown>, alias: string, dataKey: string): unknown {
  if (alias in row) return row[alias];
  if (dataKey in row) return row[dataKey];
  const arrow = row[`data->>${dataKey}`];
  if (arrow !== undefined) return arrow;
  const data = row.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return (data as Record<string, unknown>)[dataKey];
  }
  return null;
}

function readPartPallet(row: Record<string, unknown>): boolean {
  if (row.is_part_pallet === true) return true;
  return readApproved(pickJson(row, "is_part_pallet", "isPartPallet"));
}

function countCompletedRows(value: unknown): number | null {
  const rows = coerceRowList(value);
  if (!rows) return null;
  return rows.filter((row) => isCompletePalletRow(row)).length;
}

function coerceRowList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readResumedFrom(row: Record<string, unknown>): string | null {
  const text = readText(pickJson(row, "resumed_from", "resumedFrom"), "blank-null");
  if (!text || text === row.id) return null;
  return text;
}

function readApproved(value: unknown): boolean {
  return value === true || value === "true";
}

function readPalletNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return 0;
}

function readQuantity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function readText(value: unknown, mode: "keep" | "blank-null"): string | null {
  if (typeof value !== "string") return null;
  if (containsImagePayload(value)) return null;
  if (mode === "blank-null") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value;
}

function blankToNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || containsImagePayload(trimmed)) return null;
  return trimmed;
}

function containsImagePayload(value: string): boolean {
  return IMAGE_PAYLOAD.test(value);
}
