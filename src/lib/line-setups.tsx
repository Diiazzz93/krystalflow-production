// Line Setup Presets — saved filling line configurations operators can reuse
// during product changeovers. Persisted in localStorage; shared by the
// dedicated "Line Setup" sidebar page and the "View Line Setup" button
// inside production jobs.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface LineSetupPreset {
  id: string;
  product: string;
  bottleSize: string;
  line: string; // e.g. "L1"
  // Machine values
  fillVolumeMl: number;
  fillNozzleHeightMm: number;
  fillSpeedPct: number;
  conveyorSpeedHz: number;
  conveyorTensionPct: number;
  capperTorqueNm: number;
  capperHeadHeightMm: number;
  labelOffsetMm: number;
  labelTempC: number;
  startDelayMs: number;
  stopDelayMs: number;
  sensorFillPositionMm: number;
  sensorCapPositionMm: number;
  sensorLabelPositionMm: number;
  notes?: string;
  // Metadata
  favourite: boolean;
  lastUsedAt?: string; // ISO
  successfulRuns: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

const STORAGE_KEY = "krystalshield.lineSetups.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function buildSeed(): LineSetupPreset[] {
  const now = new Date().toISOString();
  return [
    {
      id: uid(),
      product: "Industrial Surface Cleaner",
      bottleSize: "500ml",
      line: "L1",
      fillVolumeMl: 500,
      fillNozzleHeightMm: 145,
      fillSpeedPct: 85,
      conveyorSpeedHz: 32,
      conveyorTensionPct: 70,
      capperTorqueNm: 2.4,
      capperHeadHeightMm: 220,
      labelOffsetMm: 12,
      labelTempC: 145,
      startDelayMs: 250,
      stopDelayMs: 180,
      sensorFillPositionMm: 80,
      sensorCapPositionMm: 110,
      sensorLabelPositionMm: 95,
      notes: "Stable run — verified by M. Hassan.",
      favourite: true,
      lastUsedAt: now,
      successfulRuns: 12,
      createdAt: now,
      updatedAt: now,
      createdBy: "M. Hassan",
    },
    {
      id: uid(),
      product: "Crop Defender Concentrate",
      bottleSize: "1L",
      line: "L2",
      fillVolumeMl: 1000,
      fillNozzleHeightMm: 175,
      fillSpeedPct: 78,
      conveyorSpeedHz: 28,
      conveyorTensionPct: 65,
      capperTorqueNm: 3.1,
      capperHeadHeightMm: 245,
      labelOffsetMm: 14,
      labelTempC: 150,
      startDelayMs: 300,
      stopDelayMs: 220,
      sensorFillPositionMm: 90,
      sensorCapPositionMm: 130,
      sensorLabelPositionMm: 105,
      notes: "Use after IBC pre-mix is at 22°C.",
      favourite: false,
      lastUsedAt: now,
      successfulRuns: 7,
      createdAt: now,
      updatedAt: now,
      createdBy: "P. Singh",
    },
    {
      id: uid(),
      product: "Citrus Hand Soap",
      bottleSize: "250ml",
      line: "L3",
      fillVolumeMl: 250,
      fillNozzleHeightMm: 120,
      fillSpeedPct: 70,
      conveyorSpeedHz: 24,
      conveyorTensionPct: 60,
      capperTorqueNm: 1.8,
      capperHeadHeightMm: 195,
      labelOffsetMm: 10,
      labelTempC: 138,
      startDelayMs: 200,
      stopDelayMs: 160,
      sensorFillPositionMm: 70,
      sensorCapPositionMm: 95,
      sensorLabelPositionMm: 85,
      favourite: false,
      successfulRuns: 4,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function load(): LineSetupPreset[] {
  if (typeof window === "undefined") return buildSeed();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LineSetupPreset[];
  } catch {
    /* ignore */
  }
  return buildSeed();
}

interface Ctx {
  presets: LineSetupPreset[];
  add: (p: Omit<LineSetupPreset, "id" | "createdAt" | "updatedAt" | "favourite" | "successfulRuns"> & Partial<Pick<LineSetupPreset, "favourite" | "successfulRuns">>) => LineSetupPreset;
  update: (id: string, patch: Partial<LineSetupPreset>) => void;
  remove: (id: string) => void;
  toggleFavourite: (id: string) => void;
  markUsed: (id: string) => void;
}

const LineSetupContext = createContext<Ctx | null>(null);

export function LineSetupProvider({ children }: { children: ReactNode }) {
  const [presets, setPresets] = useState<LineSetupPreset[]>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch {
      /* ignore */
    }
  }, [presets]);

  const add: Ctx["add"] = useCallback((p) => {
    const now = new Date().toISOString();
    const created: LineSetupPreset = {
      ...p,
      id: uid(),
      favourite: p.favourite ?? false,
      successfulRuns: p.successfulRuns ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    setPresets((s) => [created, ...s]);
    return created;
  }, []);

  const update = useCallback((id: string, patch: Partial<LineSetupPreset>) => {
    setPresets((s) =>
      s.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setPresets((s) => s.filter((p) => p.id !== id));
  }, []);

  const toggleFavourite = useCallback((id: string) => {
    setPresets((s) => s.map((p) => (p.id === id ? { ...p, favourite: !p.favourite } : p)));
  }, []);

  const markUsed = useCallback((id: string) => {
    setPresets((s) =>
      s.map((p) =>
        p.id === id
          ? { ...p, lastUsedAt: new Date().toISOString(), successfulRuns: p.successfulRuns + 1 }
          : p,
      ),
    );
  }, []);

  const value = useMemo<Ctx>(
    () => ({ presets, add, update, remove, toggleFavourite, markUsed }),
    [presets, add, update, remove, toggleFavourite, markUsed],
  );

  return <LineSetupContext.Provider value={value}>{children}</LineSetupContext.Provider>;
}

export function useLineSetups() {
  const ctx = useContext(LineSetupContext);
  if (!ctx) throw new Error("useLineSetups must be used within LineSetupProvider");
  return ctx;
}

/** Find best-match preset for a job's product + bottle size. */
export function findSetupForJob(
  presets: LineSetupPreset[],
  product: string,
  bottleSize: string,
): LineSetupPreset | null {
  const p = product.trim().toLowerCase();
  const b = bottleSize.trim().toLowerCase();
  return (
    presets.find(
      (x) => x.product.toLowerCase() === p && x.bottleSize.toLowerCase() === b,
    ) ??
    presets.find((x) => x.product.toLowerCase() === p) ??
    null
  );
}
