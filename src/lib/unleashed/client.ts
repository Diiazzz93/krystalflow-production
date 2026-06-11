// Unleashed API client — live, server-backed.
//
// All real HTTP + HMAC signing happens server-side in
// `api.functions.ts` (credentials live in Lovable Cloud secrets).
// This module just forwards to those server functions so existing
// consumers (sync service, stock pages) keep their current shapes.

import {
  unleashedFetchProducts,
  unleashedFetchStockOnHand,
  unleashedFetchWarehouses,
} from "./api.functions";
import type {
  UnleashedCategory,
  UnleashedCredentials,
  UnleashedProduct,
  UnleashedStockOnHand,
  UnleashedWarehouse,
} from "./types";

export interface UnleashedClient {
  fetchWarehouses(): Promise<UnleashedWarehouse[]>;
  fetchProducts(category?: UnleashedCategory): Promise<UnleashedProduct[]>;
  fetchStockOnHand(warehouseCode?: string): Promise<UnleashedStockOnHand[]>;
}

export function createUnleashedClient(_credentials?: Partial<UnleashedCredentials>): UnleashedClient {
  return {
    async fetchWarehouses() {
      return unleashedFetchWarehouses();
    },
    async fetchProducts(category) {
      const all = await unleashedFetchProducts();
      if (!category) return all;
      // Unleashed has no native LovableCategory field — best-effort match
      // against the product group name until mapping rules are configured.
      return all.filter((p) => p.LovableCategory === category);
    },
    async fetchStockOnHand(warehouseCode) {
      return unleashedFetchStockOnHand({ data: { warehouseCode } });
    },
  };
}
