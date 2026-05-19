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
import { buildSeedJobs, buildSeedQC, SEED_LINES } from "./seed";

const STORAGE_KEY = "krystalshield.v1";

interface PersistedState {
  jobs: Job[];
  lines: Line[];
  qc: QCEntry[];
}

interface StoreContextValue extends PersistedState {
  addJob: (job: Job) => void;
  updateJob: (id: string, patch: Partial<Job>) => void;
  deleteJob: (id: string) => void;
  addQC: (entry: QCEntry) => void;
  reset: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function loadInitial(): PersistedState {
  if (typeof window === "undefined") {
    const jobs = buildSeedJobs();
    return { jobs, lines: SEED_LINES, qc: buildSeedQC(jobs) };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedState;
  } catch {
    /* ignore */
  }
  const jobs = buildSeedJobs();
  return { jobs, lines: SEED_LINES, qc: buildSeedQC(jobs) };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadInitial());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota */
    }
  }, [state]);

  const addJob = useCallback(
    (job: Job) => setState((s) => ({ ...s, jobs: [...s.jobs, job] })),
    [],
  );
  const updateJob = useCallback(
    (id: string, patch: Partial<Job>) =>
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
      })),
    [],
  );
  const deleteJob = useCallback(
    (id: string) =>
      setState((s) => ({
        ...s,
        jobs: s.jobs.filter((j) => j.id !== id),
        qc: s.qc.filter((q) => q.jobId !== id),
      })),
    [],
  );
  const addQC = useCallback(
    (entry: QCEntry) =>
      setState((s) => {
        const failed = entry.result === "Fail";
        const updatedJobs = failed
          ? s.jobs.map((j) =>
              j.id === entry.jobId ? { ...j, status: "Requires Review" as const } : j,
            )
          : s.jobs;
        return { ...s, qc: [...s.qc, entry], jobs: updatedJobs };
      }),
    [],
  );
  const reset = useCallback(() => {
    const jobs = buildSeedJobs();
    setState({ jobs, lines: SEED_LINES, qc: buildSeedQC(jobs) });
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({ ...state, addJob, updateJob, deleteJob, addQC, reset }),
    [state, addJob, updateJob, deleteJob, addQC, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
