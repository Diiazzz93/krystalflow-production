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
const JOB_COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

interface LocalState {
  lines: Line[];
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
  addQC: (entry: QCEntry) => Promise<void>;
  updateQC: (id: string, patch: Partial<QCEntry>) => Promise<void>;
  reset: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function loadLocal(): LocalState {
  if (typeof window === "undefined") return { lines: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalState>;
      return { lines: parsed.lines ?? [] };
    }
  } catch {
    /* ignore */
  }
  return { lines: [] };
}

// ---- QC <-> DB row mapping ----
function qcToRow(e: QCEntry) {
  return {
    id: e.id,
    job_id: e.jobId,
    pallet_code: e.palletCode ?? e.id,
    pallet_number: e.palletNumber,
    result: e.result,
    operator_name: e.operatorName ?? "",
    data: e as unknown as Record<string, unknown>,
  };
}

function rowToQC(r: Record<string, unknown>): QCEntry {
  const data = (r.data as Partial<QCEntry> | undefined) ?? {};
  return {
    ...(data as QCEntry),
    id: String(r.id),
    jobId: String(r.job_id ?? data.jobId ?? ""),
    palletCode: String(r.pallet_code ?? data.palletCode ?? ""),
    palletNumber: Number(r.pallet_number ?? data.palletNumber ?? 0),
    result: (r.result as "Pass" | "Fail") ?? data.result ?? "Pass",
    operatorName: String(r.operator_name ?? data.operatorName ?? ""),
    timestamp: data.timestamp ?? String(r.created_at ?? new Date().toISOString()),
  };
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

function inferSkusFromComponents(components: { productCode: string; name: string }[]) {
  const out: { bottleSku?: string; capSku?: string; labelSku?: string; cartonSku?: string; liquidSku?: string } = {};
  for (const c of components) {
    const n = (c.name || "").toUpperCase();
    const code = c.productCode;
    if (!code) continue;
    if (!out.bottleSku && (n.startsWith("BT") || n.includes(" BTL ") || n.startsWith("BTL"))) out.bottleSku = code;
    else if (!out.capSku && (n.startsWith("CAP") || n.includes(" CAP "))) out.capSku = code;
    else if (!out.cartonSku && (n.startsWith("CT") || n.includes(" CTN ") || n.startsWith("CTN"))) out.cartonSku = code;
    else if (!out.labelSku && (n.startsWith("LB") || n.startsWith("LAB") || n.includes("LABEL"))) out.labelSku = code;
    else if (!out.liquidSku && (n.includes("BULK") || /-8\b/.test(n) || /\bIBC\b/.test(n))) out.liquidSku = code;
  }
  return out;
}

function rowToJob(r: Record<string, unknown>): Job {
  const data = (r.data as Partial<Job> | undefined) ?? {};
  const scheduledStart = r.scheduled_start ? String(r.scheduled_start) : (data.scheduledStart as string | undefined);
  const fallbackDueDate = new Date();
  fallbackDueDate.setDate(fallbackDueDate.getDate() + 7);
  const colorIndex = Math.abs(String(r.customer ?? data.customer ?? "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % JOB_COLORS.length;
  const assemblyComponents = Array.isArray(data.assemblyComponents) ? data.assemblyComponents : [];
  const inferred = inferSkusFromComponents(assemblyComponents);
  // Prefer the column values as source of truth; merge richer fields from data.
  return {
    ...(data as Job),
    id: String(r.id),
    customer: String(r.customer ?? data.customer ?? ""),
    product: String(r.product ?? data.product ?? ""),
    sku: String(r.sku ?? data.sku ?? ""),
    bottleSize: data.bottleSize ?? "",
    quantity: Number(data.quantity ?? 0),
    pallets: Number(data.pallets ?? 1),
    bottlesPerCarton: data.bottlesPerCarton,
    cartonsOrdered: data.cartonsOrdered,
    dueDate: String(data.dueDate ?? fallbackDueDate.toISOString().slice(0, 10)),
    priority: data.priority ?? "Normal",
    status: (r.status as Job["status"]) ?? data.status ?? "Scheduled",
    operator: String(r.operator ?? data.operator ?? ""),
    line: String(r.line ?? data.line ?? ""),
    rawMaterial: data.rawMaterial ?? "Pending",
    labels: data.labels ?? "Pending",
    packaging: data.packaging ?? "Pending",
    scheduledStart,
    scheduledEnd: (r.scheduled_end as string) ?? data.scheduledEnd,
    bottlesPerHour: Number(data.bottlesPerHour ?? 3000),
    setupMinutes: Number(data.setupMinutes ?? 30),
    notes: data.notes ?? "",
    bottlesCompleted: Number(data.bottlesCompleted ?? 0),
    palletsCompleted: Number(data.palletsCompleted ?? 0),
    downtimeMinutes: Number(data.downtimeMinutes ?? 0),
    actualRuntimeMinutes: Number(data.actualRuntimeMinutes ?? 0),
    customerColor: data.customerColor ?? JOB_COLORS[colorIndex],
    createdAt: data.createdAt ?? String(r.created_at ?? new Date().toISOString()),
    unleashedSalesOrderNumber: data.unleashedSalesOrderNumber ?? (String(r.unleashed_sales_order_number ?? "") || undefined),
    unleashedAssemblyNumber: data.unleashedAssemblyNumber ?? (String(r.unleashed_assembly_number ?? "") || undefined),
    assemblyComponents,
    assemblyStatus: data.assemblyStatus,
    assemblyCreatedAt: data.assemblyCreatedAt,
    assemblyCompletedAt: data.assemblyCompletedAt,
    bottleSku: data.bottleSku ?? inferred.bottleSku,
    capSku: data.capSku ?? inferred.capSku,
    labelSku: data.labelSku ?? inferred.labelSku,
    cartonSku: data.cartonSku ?? inferred.cartonSku,
    liquidSku: data.liquidSku ?? inferred.liquidSku,
    // Production progress: original totals fall back to current values when
    // the record was created before this feature shipped.
    originalQuantity: data.originalQuantity ?? Number(data.quantity ?? 0),
    originalPallets: data.originalPallets ?? Number(data.pallets ?? 0),
    completedQuantity: Number(data.completedQuantity ?? 0),
    completedPallets: Number(data.completedPallets ?? data.palletsCompleted ?? 0),
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
      if (failed) {
        void updateJob(j.id, { status: "Requires Review" });
        return;
      }

      // Production progress tracking: bump completed totals when QC passes.
      const original = j.originalQuantity ?? j.quantity ?? 0;
      const originalPallets = j.originalPallets ?? j.pallets ?? 0;
      const perPallet = entry.palletQuantity ?? (originalPallets > 0 ? original / originalPallets : 0);
      const completedQuantity = Math.min(original, (j.completedQuantity ?? 0) + Math.max(0, perPallet));
      const completedPallets = Math.min(originalPallets || Number.POSITIVE_INFINITY, (j.completedPallets ?? j.palletsCompleted ?? 0) + 1);
      const isComplete = originalPallets > 0 && completedPallets >= originalPallets;
      void updateJob(j.id, {
        completedQuantity,
        completedPallets,
        palletsCompleted: completedPallets,
        bottlesCompleted: Math.max(j.bottlesCompleted, completedQuantity),
        status: isComplete ? "Complete" : j.status === "Scheduled" ? "Filling" : j.status,
      });
    },
    [jobs, updateJob],
  );


  const reset = useCallback(() => {
    setLocal({ lines: [], qc: [] });
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
