// Preset templates to pre-fill the QC / Filling Line Log Sheet.
// Persisted in the backend (app_settings) so they are shared across all
// devices, users, and domains (preview vs published). localStorage is used
// only as a fast first-paint cache.

import { supabase } from "@/integrations/supabase/client";

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
const SETTINGS_KEY = "qc_custom_presets";

let cache: QCPreset[] | null = null;
let remoteLoaded = false;
let inflight: Promise<QCPreset[]> | null = null;

function readLocal(): QCPreset[] {
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

function writeLocal(list: QCPreset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

async function loadRemote(): Promise<QCPreset[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      const value = (data?.value ?? []) as unknown;
      const list = Array.isArray(value) ? (value as QCPreset[]) : [];
      cache = list;
      remoteLoaded = true;
      writeLocal(list);
      emit();
      return list;
    } catch {
      // Network/auth failure — keep local cache as fallback.
      remoteLoaded = true;
      return cache ?? readLocal();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function saveRemote(list: QCPreset[]) {
  try {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value: list as unknown as object }, { onConflict: "key" });
    if (error) throw error;
  } catch (e) {
    console.error("[qc-presets] failed to save to backend", e);
    throw e;
  }
}

// Eagerly kick off remote load on first import (client only).
if (typeof window !== "undefined") {
  cache = readLocal();
  void loadRemote();
}

export function getCustomPresets(): QCPreset[] {
  if (cache) return cache;
  const local = readLocal();
  cache = local;
  if (!remoteLoaded) void loadRemote();
  return local;
}

export function getAllPresets(): QCPreset[] {
  return [...DEFAULT_QC_PRESETS, ...getCustomPresets()];
}

export async function refreshPresets(): Promise<QCPreset[]> {
  return loadRemote();
}

export async function upsertCustomPreset(preset: QCPreset) {
  const list = [...getCustomPresets()];
  const idx = list.findIndex((p) => p.id === preset.id);
  const next = { ...preset, builtIn: false };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  cache = list;
  writeLocal(list);
  emit();
  await saveRemote(list);
}

export async function deleteCustomPreset(id: string) {
  const list = getCustomPresets().filter((p) => p.id !== id);
  cache = list;
  writeLocal(list);
  emit();
  await saveRemote(list);
}

export function subscribeToPresets(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  // Trigger a fresh fetch when subscribing so newly mounted consumers
  // pick up presets created on other devices/domains.
  void loadRemote();
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
