// Lightweight key-value helper backed by the public.app_settings table.
// Used to share small pieces of cross-device configuration (branding,
// QC presets, line setups, customer specs) between preview and published
// builds. localStorage is used only as a fast first-paint cache.

import { supabase } from "@/integrations/supabase/client";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json }
  | Json[];

export async function loadSetting<T extends Json>(
  key: string,
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return (data?.value ?? null) as T | null;
  } catch (e) {
    console.warn(`[app-settings] load failed for ${key}`, e);
    return null;
  }
}

export async function saveSetting<T extends Json>(
  key: string,
  value: T,
): Promise<void> {
  const safe = JSON.parse(JSON.stringify(value));
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value: safe }, { onConflict: "key" });
  if (error) {
    console.error(`[app-settings] save failed for ${key}`, error);
    throw error;
  }
}
