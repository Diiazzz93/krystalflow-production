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

export const DEFAULT_QC_PRESETS: QCPreset[] = [];

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
