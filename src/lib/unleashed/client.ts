// Unleashed API client — live, server-backed.
//
// All real HTTP + HMAC signing happens server-side in
// `api.functions.ts` (credentials live in Lovable Cloud secrets).
// This module just forwards to those server functions so existing
// consumers (sync service, stock pages) keep their current shapes.

import {
  unleashedFetchProductGroups,
  unleashedFetchProducts,
  unleashedFetchStockOnHand,
  unleashedFetchWarehouses,
} from "./api.functions";
import { getSelectedProductGroups } from "./mapping";
import type {
  UnleashedCredentials,
  UnleashedProduct,
  UnleashedProductGroup,
  UnleashedStockOnHand,
  UnleashedWarehouse,
} from "./types";

export interface UnleashedClient {
  fetchWarehouses(): Promise<UnleashedWarehouse[]>;
  fetchProductGroups(): Promise<UnleashedProductGroup[]>;
  /**
   * If `groupNames` is omitted, falls back to the user's saved
   * selected groups. If no groups are selected, returns []
   * (we deliberately do not pull the whole catalogue).
   */
  fetchProducts(groupNames?: string[]): Promise<UnleashedProduct[]>;
  fetchStockOnHand(warehouseCode?: string): Promise<UnleashedStockOnHand[]>;
}

export function createUnleashedClient(_credentials?: Partial<UnleashedCredentials>): UnleashedClient {
  return {
    async fetchWarehouses() {
      return unleashedFetchWarehouses();
    },
    async fetchProductGroups() {
      return unleashedFetchProductGroups();
    },
    async fetchProducts(groupNames) {
      const groups = groupNames ?? getSelectedProductGroups();
      return unleashedFetchProducts({ data: { groupNames: groups } });
    },
    async fetchStockOnHand(warehouseCode) {
      return unleashedFetchStockOnHand({ data: { warehouseCode } });
    },
  };
}
