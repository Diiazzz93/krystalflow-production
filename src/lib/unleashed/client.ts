// Unleashed API client (mock implementation).
//
// This module is the swap-point for live Unleashed integration. The public
// methods (`fetchProducts`, `fetchStockOnHand`, `fetchWarehouses`) return
// the same shapes that the real Unleashed REST API returns, so consumers
// (the sync service, stock pages, job stock checks) do not need to change
// when we wire up live calls.
//
// To go live later:
//   1. Replace the mock returns below with `fetch()` calls to
//      `https://api.unleashedsoftware.com/<endpoint>` using HMAC-SHA256
//      signing with `apiId` + `apiKey` as documented at
//      https://apidocs.unleashedsoftware.com/AuthenticationHelp
//   2. Move credential reads to a server function (createServerFn) so the
//      API key never reaches the browser.
//   3. Keep this file's exported function signatures unchanged.

import {
  MOCK_PRODUCTS,
  MOCK_STOCK_ON_HAND,
  MOCK_WAREHOUSES,
} from "./mock-data";
import type {
  UnleashedCategory,
  UnleashedCredentials,
  UnleashedProduct,
  UnleashedStockOnHand,
  UnleashedWarehouse,
} from "./types";

const SIMULATED_LATENCY_MS = 350;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

export interface UnleashedClient {
  fetchWarehouses(): Promise<UnleashedWarehouse[]>;
  fetchProducts(category?: UnleashedCategory): Promise<UnleashedProduct[]>;
  fetchStockOnHand(warehouseCode?: string): Promise<UnleashedStockOnHand[]>;
}

export function createUnleashedClient(_credentials?: Partial<UnleashedCredentials>): UnleashedClient {
  // Credentials are intentionally unused in the mock implementation.
  // The live client will sign every request with `_credentials.apiId` / `apiKey`.
  return {
    async fetchWarehouses() {
      return delay(MOCK_WAREHOUSES);
    },
    async fetchProducts(category) {
      const all = MOCK_PRODUCTS;
      return delay(category ? all.filter((p) => p.LovableCategory === category) : all);
    },
    async fetchStockOnHand(warehouseCode) {
      const all = MOCK_STOCK_ON_HAND;
      return delay(
        warehouseCode ? all.filter((s) => s.Warehouse.WarehouseCode === warehouseCode) : all,
      );
    },
  };
}
