import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Job, Line, QCEntry } from "./types";
import { buildSeedQC, SEED_LINES } from "./seed";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const STORAGE_KEY = "krystalshield.v2.local";

interface LocalState {
  lines: Line[];
  qc: QCEntry[];
}

interface StoreContextValue {
  jobs: Job[];
  lines: Line[];
  qc: QCEntry[];
  loading: boolean;
  addJob: (job: Job) => Promise<void>;
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  addLine: (line: Line) => void;
  updateLine: (id: string, patch: Partial<Line>) => void;
  deleteLine: (id: string) => void;
  addQC: (entry: QCEntry) => void;
  reset: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function loadLocal(): LocalState {
  if (typeof window === "undefined") {
    return { lines: SEED_LINES, qc: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalState;
  } catch {
    /* ignore */
  }
  return { lines: SEED_LINES, qc: [] };
}

// ---- Job <-> DB row mapping ----
// Columns mirror frequent filters; everything else lives in `data` jsonb so
// the rich Job type round-trips without a schema change per field.

function jobToRow(j: Job) {
  return {
    id: j.id,
    customer: j.customer,
    product: j.product,
    sku: j.sku,
    status: j.status,
    operator: j.operator ?? "",
    line: j.line ?? "",
    scheduled_start: j.scheduledStart ? new Date(j.scheduledStart).toISOString() : null,
    scheduled_end: j.scheduledEnd ? new Date(j.scheduledEnd).toISOString() : null,
    data: j as unknown as Record<string, unknown>,
  };
}

function rowToJob(r: Record<string, unknown>): Job {
  const data = (r.data as Partial<Job> | undefined) ?? {};
  // Prefer the column values as source of truth; merge richer fields from data.
  return {
    ...(data as Job),
    id: String(r.id),
    customer: String(r.customer ?? data.customer ?? ""),
    product: String(r.product ?? data.product ?? ""),
    sku: String(r.sku ?? data.sku ?? ""),
    status: (r.status as Job["status"]) ?? data.status ?? "Scheduled",
    operator: String(r.operator ?? data.operator ?? ""),
    line: String(r.line ?? data.line ?? ""),
    scheduledStart: (r.scheduled_start as string) ?? data.scheduledStart ?? new Date().toISOString(),
    scheduledEnd: (r.scheduled_end as string) ?? data.scheduledEnd,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [local, setLocal] = useState<LocalState>(() => loadLocal());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    } catch {
      /* ignore */
    }
  }, [local]);

  const loadJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("production_jobs")
      .select("*")
      .order("scheduled_start", { ascending: true, nullsFirst: false });
    if (error) {
      console.error("[jobs] load failed", error);
      toast.error(`Failed to load jobs: ${error.message}`);
      return [] as Job[];
    }
    const mapped = (data ?? []).map(rowToJob);
    setJobs(mapped);
    return mapped;
  }, []);

  // Initial jobs load (after auth ready). QC entries depend on jobs, so
  // refresh seeded QC once jobs are present and qc is still empty.
  useEffect(() => {
    if (!user) {
      setJobs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await loadJobs();
      if (!cancelled && list.length && local.qc.length === 0) {
        setLocal((s) => ({ ...s, qc: buildSeedQC(list) }));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadJobs]);

  // ---- Jobs (Supabase) ----
  const addJob = useCallback<StoreContextValue["addJob"]>(async (job) => {
    // Let DB generate id; ignore client's id so it stays unique.
    const { id: _ignored, ...rest } = jobToRow(job);
    const { data, error } = await supabase
      .from("production_jobs")
      .insert(rest as never)
      .select()
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Could not create job");
      return;
    }
    setJobs((s) => [...s, rowToJob(data)]);
    toast.success("Job created");
  }, []);

  const updateJob = useCallback<StoreContextValue["updateJob"]>(async (id, patch) => {
    const current = jobs.find((j) => j.id === id);
    const merged = { ...(current ?? ({} as Job)), ...patch, id };
    const row = jobToRow(merged);
    const { data, error } = await supabase
      .from("production_jobs")
      .update({
        customer: row.customer,
        product: row.product,
        sku: row.sku,
        status: row.status,
        operator: row.operator,
        line: row.line,
        scheduled_start: row.scheduled_start,
        scheduled_end: row.scheduled_end,
        data: row.data as never,
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Could not update job");
      return;
    }
    setJobs((s) => s.map((j) => (j.id === id ? rowToJob(data) : j)));
  }, [jobs]);

  const deleteJob = useCallback<StoreContextValue["deleteJob"]>(async (id) => {
    const { error } = await supabase.from("production_jobs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setJobs((s) => s.filter((j) => j.id !== id));
    setLocal((s) => ({ ...s, qc: s.qc.filter((q) => q.jobId !== id) }));
  }, []);

  // ---- Lines (local) ----
  const addLine = useCallback(
    (line: Line) => setLocal((s) => ({ ...s, lines: [...s.lines, line] })),
    [],
  );
  const updateLine = useCallback(
    (id: string, patch: Partial<Line>) =>
      setLocal((s) => ({ ...s, lines: s.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    [],
  );
  const deleteLine = useCallback(
    (id: string) => setLocal((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== id) })),
    [],
  );

  // ---- QC (local) ----
  const addQC = useCallback(
    (entry: QCEntry) => {
      const failed = entry.result === "Fail";
      setLocal((s) => ({ ...s, qc: [...s.qc, entry] }));
      // Mirror the auto-status side effects against Supabase.
      const j = jobs.find((x) => x.id === entry.jobId);
      if (!j) return;
      if (failed) void updateJob(j.id, { status: "Requires Review" });
      else if (j.status === "Scheduled") void updateJob(j.id, { status: "Filling" });
    },
    [jobs, updateJob],
  );

  const reset = useCallback(() => {
    setLocal({ lines: SEED_LINES, qc: [] });
    void loadJobs();
  }, [loadJobs]);

  const value = useMemo<StoreContextValue>(
    () => ({
      jobs,
      lines: local.lines,
      qc: local.qc,
      loading,
      addJob,
      updateJob,
      deleteJob,
      addLine,
      updateLine,
      deleteLine,
      addQC,
      reset,
    }),
    [jobs, local, loading, addJob, updateJob, deleteJob, addLine, updateLine, deleteLine, addQC, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
