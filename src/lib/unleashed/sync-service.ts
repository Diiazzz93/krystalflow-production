// Inventory sync service.
//
// Coordinates per-category sync jobs against the Unleashed client and keeps
// a small reactive state (credentials, last sync time, per-category results)
// in localStorage so the Settings page can render status without a backend.
//
// Today this orchestrates the MOCK client. When the live client is wired up
// in `client.ts`, this file does not need to change.

import { createUnleashedClient } from "./client";
import type {
  SyncResult,
  SyncState,
  UnleashedCategory,
  UnleashedCredentials,
} from "./types";

const CREDENTIALS_KEY = "unleashed.credentials";
const SYNC_STATE_KEY = "unleashed.sync-state";

export const SYNC_CATEGORIES: UnleashedCategory[] = [
  "product",
  "bottle",
  "cap",
  "label",
  "carton",
  "liquid",
];

export const CATEGORY_LABELS: Record<UnleashedCategory, string> = {
  product: "Products",
  bottle: "Bottles",
  cap: "Caps",
  label: "Labels",
  carton: "Cartons",
  liquid: "Liquid / IBCs",
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function getCredentials(): UnleashedCredentials {
  return safeRead<UnleashedCredentials>(CREDENTIALS_KEY, {
    apiId: "",
    apiKey: "",
    warehouseCode: "",
  });
}

export function saveCredentials(creds: UnleashedCredentials) {
  safeWrite(CREDENTIALS_KEY, creds);
  emit();
}

export function getSyncState(): SyncState {
  return safeRead<SyncState>(SYNC_STATE_KEY, {
    lastSyncAt: null,
    status: "idle",
    lastError: null,
    results: [],
  });
}

function setSyncState(next: SyncState) {
  safeWrite(SYNC_STATE_KEY, next);
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sync a single category. Mock implementation pulls from the Unleashed mock
 * client; the live implementation will diff against local stock and update
 * the underlying store.
 */
export async function syncCategory(category: UnleashedCategory): Promise<SyncResult> {
  const creds = getCredentials();
  const client = createUnleashedClient(creds);
  const startedAt = new Date().toISOString();

  try {
    const products = await client.fetchProducts();
    const finishedAt = new Date().toISOString();
    return {
      category,
      itemsSynced: products.length,
      startedAt,
      finishedAt,
      status: "success",
    };
  } catch (err) {
    return {
      category,
      itemsSynced: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Sync all categories sequentially and persist the run summary. */
export async function syncAll(): Promise<SyncState> {
  const state = getSyncState();
  setSyncState({ ...state, status: "syncing", lastError: null });

  const results: SyncResult[] = [];
  for (const cat of SYNC_CATEGORIES) {
    const r = await syncCategory(cat);
    results.push(r);
  }

  const anyError = results.find((r) => r.status === "error");
  const finalState: SyncState = {
    lastSyncAt: new Date().toISOString(),
    status: anyError ? "error" : "success",
    lastError: anyError?.error ?? null,
    results,
  };
  setSyncState(finalState);
  return finalState;
}
