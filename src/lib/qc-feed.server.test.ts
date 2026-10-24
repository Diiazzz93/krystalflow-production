import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  QC_FEED_LIMIT,
  QcFeedQueryError,
  loadCompletedQcFeed,
  shapeQcFeedItem,
  takeQcFeedPage,
} from "./qc-feed.server";

const JOB_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function at(minute: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
}

function submittedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    job_id: JOB_ID,
    pallet_code: "KS-AB23",
    pallet_number: 1,
    result: "Pass",
    operator_name: "Alex",
    created_at: "2026-10-20T04:15:00.000Z",
    updated_at: "2026-10-20T04:16:00.000Z",
    qc_approved: "true",
    supervisor_name: "Sam",
    supervisor_signoff: null,
    m_number: "M-100",
    pallet_quantity: "48",
    pallet_type: "CHEP",
    notes: "Checked at end of shift",
    log_date: "2026-10-20",
    title: "Ignored when a job is linked",
    pallet_row_volumes: [{ row: "1", pump1: "500", pump2: "500" }],
    resumed_from: null,
    is_part_pallet: null,
    ...overrides,
  };
}

const job = {
  id: JOB_ID,
  customer: "Example Customer",
  product: "Example Cleaner 500ml",
  sku: "EX-500",
  line: "Line 1",
  unleashed_sales_order_number: "SO-10001",
};

describe("shapeQcFeedItem", () => {
  const jobs = new Map([[JOB_ID, job]]);

  it("keeps the existing fields and adds the three new ones", () => {
    const item = shapeQcFeedItem(submittedRow(), jobs);
    expect(item).toMatchObject({
      id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      pallet_code: "KS-AB23",
      pallet_number: 1,
      result: "Pass",
      approved: true,
      flagged: false,
      operator_name: "Alex",
      supervisor_name: "Sam",
      m_number: "M-100",
      pallet_quantity: 48,
      pallet_type: "CHEP",
      notes: "Checked at end of shift",
      log_date: "2026-10-20",
      created_at: "2026-10-20T04:15:00.000Z",
      updated_at: "2026-10-20T04:16:00.000Z",
      title: null,
      is_part_pallet: false,
      rows_completed: 1,
      resumed_from: null,
      job,
    });
  });

  it("counts only pallet rows with a name and both pump volumes", () => {
    const item = shapeQcFeedItem(
      submittedRow({
        pallet_row_volumes: [
          { row: "1", pump1: "500", pump2: "500" },
          { row: "2", pump1: "10", pump2: "" },
          { row: "", pump1: "", pump2: "" },
          { row: "4", pump1: 480, pump2: 490 },
        ],
      }),
      new Map(),
    );
    expect(item.rows_completed).toBe(2);
  });

  it("returns null when the form has no pallet-row list", () => {
    expect(
      shapeQcFeedItem(submittedRow({ pallet_row_volumes: null }), new Map()).rows_completed,
    ).toBeNull();
    const row = submittedRow();
    delete row.pallet_row_volumes;
    expect(shapeQcFeedItem(row, new Map()).rows_completed).toBeNull();
  });

  it("returns 0 when the list exists and every row is unfinished", () => {
    const item = shapeQcFeedItem(
      submittedRow({ pallet_row_volumes: [{ row: "1", pump1: "", pump2: "" }] }),
      new Map(),
    );
    expect(item.rows_completed).toBe(0);
  });

  it("reads a JSON string of pallet rows", () => {
    const item = shapeQcFeedItem(
      submittedRow({
        pallet_row_volumes: JSON.stringify([
          { row: "A", pump1: "1", pump2: "2" },
          { row: "B", pump1: "1", pump2: "0" },
        ]),
      }),
      new Map(),
    );
    expect(item.rows_completed).toBe(1);
  });

  it("reads a part-pallet flag stored on the form data", () => {
    const item = shapeQcFeedItem(submittedRow({ is_part_pallet: "true" }), new Map());
    expect(item.is_part_pallet).toBe(true);
  });

  it("passes through a stored earlier-form id and ignores a self link", () => {
    const earlier = "11111111-1111-4111-8111-111111111111";
    expect(shapeQcFeedItem(submittedRow({ resumed_from: earlier }), new Map()).resumed_from).toBe(
      earlier,
    );
    expect(
      shapeQcFeedItem(
        submittedRow({ resumed_from: "7c9e6679-7425-40de-944b-e07fc1f90ae7" }),
        new Map(),
      ).resumed_from,
    ).toBeNull();
    expect(
      shapeQcFeedItem(submittedRow({ resumed_from: "  " }), new Map()).resumed_from,
    ).toBeNull();
  });

  it("does not copy a signature drawing onto the feed item", () => {
    const item = shapeQcFeedItem(
      submittedRow({ supervisorSignatureDataUrl: "data:image/png;base64,abc" }),
      jobs,
    );
    expect(JSON.stringify(item)).not.toMatch(/signature|data:image|base64/i);
  });
});

describe("takeQcFeedPage", () => {
  it("returns the submitted page unchanged when there are no part pallets", () => {
    const records = [
      { id: "b", created_at: at(1) },
      { id: "a", created_at: at(1) },
    ];
    expect(takeQcFeedPage(records, [])).toBe(records);
  });

  it("mixes part pallets in time order and keeps every submitted form", () => {
    const records = [
      { id: "submitted-early", created_at: at(1), result: "Pass" },
      { id: "submitted-late", created_at: at(3), result: "Fail" },
    ];
    const drafts = [{ id: "part", created_at: at(2), is_part_pallet: true }];
    expect(takeQcFeedPage(records, drafts).map((row) => row.id)).toEqual([
      "submitted-early",
      "part",
      "submitted-late",
    ]);
  });

  it("prefers the submitted form when the same id is still in the part-pallet list", () => {
    const records = [{ id: "same", created_at: at(1), result: "Pass" }];
    const drafts = [
      { id: "same", created_at: at(1), is_part_pallet: true },
      { id: "other", created_at: at(2), is_part_pallet: true },
    ];
    const page = takeQcFeedPage(records, drafts);
    expect(page.map((row) => row.id)).toEqual(["same", "other"]);
    expect(page[0]).toMatchObject({ result: "Pass" });
  });

  it("does not skip an earlier submitted form when a part pallet shares a full page", () => {
    const records = Array.from({ length: QC_FEED_LIMIT }, (_, minute) => ({
      id: `record-${minute}`,
      created_at: at(minute),
    }));
    const drafts = [{ id: "part-1", created_at: at(10), is_part_pallet: true }];
    const page = takeQcFeedPage(records, drafts);
    const cursor = String(page.at(-1)?.created_at);
    const omitted = records.filter((row) => !page.some((item) => item.id === row.id));

    expect(page).toHaveLength(QC_FEED_LIMIT);
    expect(page.some((row) => row.id === "part-1")).toBe(true);
    expect(omitted.map((row) => row.id)).toEqual(["record-499"]);
    expect(omitted.every((row) => String(row.created_at) > cursor)).toBe(true);
  });

  it("holds later submitted forms when the part-pallet page is already full", () => {
    const drafts = Array.from({ length: QC_FEED_LIMIT }, (_, minute) => ({
      id: `part-${minute}`,
      created_at: at(minute),
      is_part_pallet: true,
    }));
    const records = [{ id: "later", created_at: at(QC_FEED_LIMIT + 10), result: "Pass" }];
    const page = takeQcFeedPage(records, drafts);
    expect(page.map((row) => row.id)).toEqual(drafts.map((row) => row.id));
    expect(String(page.at(-1)?.created_at) < String(records[0]?.created_at)).toBe(true);
  });
});

type FakeTable = Record<string, unknown>[];

function fakeSupabase(tables: Record<string, FakeTable>, errors: Record<string, string> = {}) {
  const selects: { table: string; columns: string }[] = [];
  const client = {
    selects,
    from(table: string) {
      const state = {
        gt: [] as [string, unknown][],
        lte: [] as [string, unknown][],
        inn: [] as [string, unknown[]][],
        order: null as { column: string; ascending: boolean } | null,
        limit: null as number | null,
      };
      const api = {
        select(columns: string) {
          selects.push({ table, columns });
          return api;
        },
        gt(column: string, value: unknown) {
          state.gt.push([column, value]);
          return api;
        },
        lte(column: string, value: unknown) {
          state.lte.push([column, value]);
          return api;
        },
        in(column: string, value: unknown[]) {
          state.inn.push([column, value]);
          return api;
        },
        order(column: string, options: { ascending: boolean }) {
          state.order = { column, ascending: options.ascending };
          return api;
        },
        limit(count: number) {
          state.limit = count;
          return api;
        },
        then(
          resolve: (value: {
            data: FakeTable | null;
            error: { message: string } | null;
          }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (errors[table]) {
            return Promise.resolve({ data: null, error: { message: errors[table] } }).then(
              resolve,
              reject,
            );
          }
          let rows = (tables[table] ?? []).map((row) => ({ ...row }));
          for (const [column, value] of state.gt) {
            rows = rows.filter((row) => String(row[column]) > String(value));
          }
          for (const [column, value] of state.lte) {
            rows = rows.filter((row) => String(row[column]) <= String(value));
          }
          for (const [column, value] of state.inn) {
            const allowed = new Set(value.map(String));
            rows = rows.filter((row) => allowed.has(String(row[column])));
          }
          if (state.order) {
            const { column, ascending } = state.order;
            rows.sort(
              (a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1),
            );
          }
          if (state.limit != null) rows = rows.slice(0, state.limit);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return client;
}

describe("loadCompletedQcFeed", () => {
  it("returns an unfinished part pallet alongside the submitted form", async () => {
    const db = fakeSupabase({
      pallet_qc_records: [submittedRow()],
      qc_pallet_drafts: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          job_id: "standalone",
          pallet_number: 2,
          updated_at: "2026-10-19T08:00:00.000Z",
          operator_name: "Riley",
          qc_approved: null,
          supervisor_name: null,
          supervisor_signoff: null,
          m_number: "",
          pallet_quantity: "72",
          pallet_type: "CHEP",
          notes: "Paused for the night",
          log_date: "2026-10-19",
          title: "Incoming inspection",
          pallet_row_volumes: [
            { row: "1", pump1: "500", pump2: "500" },
            { row: "2", pump1: "", pump2: "" },
          ],
          resumed_from: null,
          is_part_pallet: null,
        },
      ],
      production_jobs: [job],
    });

    const items = await loadCompletedQcFeed(db as unknown as SupabaseClient<Database>, {
      since: "2026-10-01T00:00:00.000Z",
      until: null,
    });

    expect(items.map((item) => item.id)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    ]);
    expect(items[0]).toMatchObject({
      is_part_pallet: true,
      rows_completed: 1,
      resumed_from: null,
      result: "",
      approved: false,
      flagged: false,
      pallet_code: "",
      pallet_number: 2,
      operator_name: "Riley",
      pallet_quantity: 72,
      title: "Incoming inspection",
      job: null,
      created_at: "2026-10-19T08:00:00.000Z",
      updated_at: "2026-10-19T08:00:00.000Z",
    });
    expect(items[1]).toMatchObject({
      is_part_pallet: false,
      rows_completed: 1,
      resumed_from: null,
      result: "Pass",
      approved: true,
      flagged: false,
      job,
    });

    const draftSelect =
      db.selects.find((entry) => entry.table === "qc_pallet_drafts")?.columns ?? "";
    const recordSelect =
      db.selects.find((entry) => entry.table === "pallet_qc_records")?.columns ?? "";
    expect(draftSelect).toContain("pallet_row_volumes:data->palletRowVolumes");
    expect(draftSelect).toContain("operator_name:data->>operatorName");
    expect(recordSelect).toContain("resumed_from:data->>resumedFrom");
    expect(draftSelect).not.toMatch(/signature/i);
    expect(recordSelect).not.toMatch(/signature/i);
    expect(JSON.stringify(items)).not.toMatch(/data:image|base64/i);
  });

  it("still includes a part pallet that has no result, signature, or finished rows", async () => {
    const db = fakeSupabase({
      pallet_qc_records: [],
      qc_pallet_drafts: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          job_id: JOB_ID,
          pallet_number: 4,
          updated_at: "2026-10-22T01:00:00.000Z",
          operator_name: "",
          supervisor_name: null,
          qc_approved: null,
          pallet_row_volumes: [{ row: "", pump1: "", pump2: "" }],
          resumed_from: null,
          is_part_pallet: null,
        },
      ],
      production_jobs: [job],
    });

    const items = await loadCompletedQcFeed(db as unknown as SupabaseClient<Database>, {
      since: "2026-10-01T00:00:00.000Z",
      until: "2026-10-23T00:00:00.000Z",
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      is_part_pallet: true,
      result: "",
      approved: false,
      flagged: false,
      rows_completed: 0,
      resumed_from: null,
      operator_name: null,
      job,
    });
  });

  it("fails the read when part pallets cannot be loaded", async () => {
    const db = fakeSupabase(
      { pallet_qc_records: [submittedRow()], qc_pallet_drafts: [] },
      { qc_pallet_drafts: 'relation "qc_pallet_drafts" does not exist' },
    );
    await expect(
      loadCompletedQcFeed(db as unknown as SupabaseClient<Database>, {
        since: "2026-10-01T00:00:00.000Z",
        until: null,
      }),
    ).rejects.toBeInstanceOf(QcFeedQueryError);
  });
});
