// Unleashed → KrystalFlow stock-on-hand mirror.
//
// Stage 1 of the two-way sync. Unleashed is the source of truth for stock
// quantities: we pull on demand (and on a schedule, later) and cache the
// last snapshot here so the rest of the app can render live numbers without
// re-hitting the API.
//
// Mock-mode today: data comes from the mock Unleashed client. The moment a
// live API key is wired into createUnleashedClient(), this module starts
// returning real data — no consumer changes required.

import { createUnleashedClient } from "./client";
import type { UnleashedStockOnHand } from "./types";

const SNAPSHOT_KEY = "unleashed.stock-snapshot";
const CONNECTED_AT_KEY = "unleashed.connected-at";
const LAST_SYNC_KEY = "unleashed.stock-last-sync";

export interface StockSnapshot {
  fetchedAt: string; // ISO
  items: UnleashedStockOnHand[];
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
export function subscribeStockMirror(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  emit();
}

/**
 * Timestamp of the first time the user successfully connected Unleashed.
 * Used as the cutoff date for importing historical assemblies (Stage 2).
 */
export function getConnectedAt(): string | null {
  return read<string | null>(CONNECTED_AT_KEY, null);
}

/** Call this from the credentials save flow the first time we save creds. */
export function markConnectedIfNew(): string {
  const existing = getConnectedAt();
  if (existing) return existing;
  const now = new Date().toISOString();
  write(CONNECTED_AT_KEY, now);
  return now;
}

export function clearConnection() {
  localStorage.removeItem(CONNECTED_AT_KEY);
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  emit();
}

export function getStockSnapshot(): StockSnapshot | null {
  return read<StockSnapshot | null>(SNAPSHOT_KEY, null);
}

export function getLastStockSyncAt(): string | null {
  return read<string | null>(LAST_SYNC_KEY, null);
}

/**
 * Pull stock-on-hand from Unleashed and persist the snapshot.
 * If `allowedProductCodes` is provided, the snapshot is filtered to only
 * those codes (Unleashed's /StockOnHand endpoint can't filter by product
 * group server-side, so callers compute the allowed set from /Products).
 */
export async function syncStockOnHand(
  warehouseCode?: string,
  allowedProductCodes?: Set<string>,
): Promise<StockSnapshot> {
  const client = createUnleashedClient();
  const allItems = await client.fetchStockOnHand(warehouseCode);
  const items =
    allowedProductCodes && allowedProductCodes.size > 0
      ? allItems.filter((i) => allowedProductCodes.has(i.ProductCode))
      : allItems;
  const snapshot: StockSnapshot = {
    fetchedAt: new Date().toISOString(),
    items,
  };
  write(SNAPSHOT_KEY, snapshot);
  write(LAST_SYNC_KEY, snapshot.fetchedAt);
  return snapshot;
}
