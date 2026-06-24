// Tracks the set of Unleashed Product Groups that represent finished /
// made-to-order goods. These items will always read 0 stock until a
// production run is bottled and packed, so they're deliberately routed out
// of "low / out of stock" alerts and shown in a separate "Made to order"
// section instead.
//
// Stored in the shared app_settings KV (key "stock.finished_goods_groups")
// so every device sees the same selection, with a localStorage cache for
// instant first-paint.

import { useEffect, useState } from "react";
import { loadSetting, saveSetting } from "@/lib/app-settings-kv";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "ks.finished-goods-groups";
const SETTING_KEY = "stock.finished_goods_groups";

let cache: string[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(groups: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {
    /* ignore */
  }
}

function setCache(next: string[]) {
  cache = Array.from(new Set(next.map((g) => g.trim()).filter(Boolean)));
  writeLocal(cache);
  listeners.forEach((l) => l());
}

export function getFinishedGoodsGroups(): string[] {
  return cache;
}

export async function setFinishedGoodsGroups(groups: string[]): Promise<void> {
  setCache(groups);
  await saveSetting(SETTING_KEY, cache);
}

export function isFinishedGoodsItem(group: string | undefined | null): boolean {
  if (!group) return false;
  return cache.includes(group.trim());
}

export function useFinishedGoodsGroups(): string[] {
  const [groups, setGroups] = useState<string[]>(() => {
    if (!hydrated && cache.length === 0) {
      const local = readLocal();
      if (local.length > 0) cache = local;
    }
    return cache;
  });

  useEffect(() => {
    const fn = () => setGroups([...cache]);
    listeners.add(fn);

    // Hydrate from backend once per tab.
    if (!hydrated) {
      hydrated = true;
      void loadSetting<string[]>(SETTING_KEY).then((remote) => {
        if (Array.isArray(remote)) setCache(remote);
      });
    }

    // Cross-device sync via realtime on app_settings.
    const channel = supabase
      .channel(`finished-goods-groups-live-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: `key=eq.${SETTING_KEY}`,
        },
        (payload) => {
          const value = (payload.new as { value?: unknown } | null)?.value;
          if (Array.isArray(value)) setCache(value as string[]);
        },
      )
      .subscribe();

    return () => {
      listeners.delete(fn);
      void supabase.removeChannel(channel);
    };
  }, []);

  return groups;
}
