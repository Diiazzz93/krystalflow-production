// Preset templates to pre-fill the QC / Filling Line Log Sheet.
// Built-in defaults live in DEFAULT_QC_PRESETS. Users can add, edit, or
// remove custom presets via the Settings page; those are persisted in
// localStorage and merged with the defaults at read time.

export interface QCPreset {
  id: string;
  name: string;
  description: string;
  builtIn?: boolean;
  values: {
    mNumber?: string;
    bottleWeight?: number;
    capWeight?: number;
    liquidWeightPer100ml?: number;
    totalWeightGrams?: number;
    minimumVolume?: number;
    maximumVolume?: number;
    boxesPerPallet?: number;
    bottleCount?: number;
    palletRowVolumes?: { row: string; pump1: string; pump2: string }[];
    notes?: string;
  };
}

export const DEFAULT_QC_PRESETS: QCPreset[] = [
  {
    id: "500ml-standard",
    name: "500ml standard fill",
    description: "Common 500ml bottle run defaults",
    builtIn: true,
    values: {
      bottleWeight: 22,
      capWeight: 3,
      liquidWeightPer100ml: 100,
      totalWeightGrams: 525,
      minimumVolume: 498,
      maximumVolume: 505,
      boxesPerPallet: 60,
      bottleCount: 1200,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
        { row: "4", pump1: "", pump2: "" },
        { row: "5", pump1: "", pump2: "" },
      ],
    },
  },
  {
    id: "1l-standard",
    name: "1L standard fill",
    description: "Common 1L bottle run defaults",
    builtIn: true,
    values: {
      bottleWeight: 38,
      capWeight: 4,
      liquidWeightPer100ml: 100,
      totalWeightGrams: 1042,
      minimumVolume: 998,
      maximumVolume: 1006,
      boxesPerPallet: 48,
      bottleCount: 720,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
        { row: "4", pump1: "", pump2: "" },
      ],
    },
  },
  {
    id: "5l-standard",
    name: "5L standard fill",
    description: "Common 5L bottle run defaults",
    builtIn: true,
    values: {
      bottleWeight: 145,
      capWeight: 8,
      liquidWeightPer100ml: 100,
      totalWeightGrams: 5153,
      minimumVolume: 4990,
      maximumVolume: 5020,
      boxesPerPallet: 24,
      bottleCount: 240,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
      ],
    },
  },
];

// Back-compat export — some files may still reference QC_PRESETS directly.
export const QC_PRESETS = DEFAULT_QC_PRESETS;

const STORAGE_KEY = "qc-custom-presets-v1";
const EVENT_NAME = "qc-presets-changed";

function readCustom(): QCPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QCPreset[];
  } catch {
    return [];
  }
}

function writeCustom(list: QCPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getCustomPresets(): QCPreset[] {
  return readCustom();
}

export function getAllPresets(): QCPreset[] {
  return [...DEFAULT_QC_PRESETS, ...readCustom()];
}

export function upsertCustomPreset(preset: QCPreset) {
  const list = readCustom();
  const idx = list.findIndex((p) => p.id === preset.id);
  const next = { ...preset, builtIn: false };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  writeCustom(list);
}

export function deleteCustomPreset(id: string) {
  writeCustom(readCustom().filter((p) => p.id !== id));
}

export function subscribeToPresets(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
