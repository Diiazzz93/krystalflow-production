// Type definitions mirroring Unleashed Software REST API responses.
// Source reference: https://apidocs.unleashedsoftware.com
//
// These types are used by the mock service layer in `mock-service.ts`
// and the real adapter in `client.ts`. When swapping mock data for live
// API responses, only the implementations need to change — the types
// already match the upstream shape.

export type UnleashedCategory =
  | "product"
  | "bottle"
  | "cap"
  | "label"
  | "carton"
  | "liquid";

/** Mirrors Unleashed `/Products` response item (subset of fields we use). */
export interface UnleashedProduct {
  Guid: string;
  ProductCode: string;
  ProductDescription: string;
  ProductGroup?: { GroupName: string } | null;
  /** Unleashed leaf sub-group (a Product Group with a ParentGroupGuid). */
  ProductSubGroup?: { GroupName: string } | null;

  UnitOfMeasure?: { Name: string } | null;
  /** Custom — used by our app to route a product into the right requirement bucket. */
  LovableCategory: UnleashedCategory;
  LastModifiedOn: string; // ISO
}

/** Mirrors Unleashed `/StockOnHand` response item (subset). */
export interface UnleashedStockOnHand {
  ProductCode: string;
  ProductDescription: string;
  QtyOnHand: number;
  AvailableQty: number;
  AllocatedQty: number;
  MinStockAlertLevel: number;
  Warehouse: { WarehouseCode: string; WarehouseName: string };
  LastModifiedOn: string; // ISO
}

/** Mirrors Unleashed `/Warehouses` response item. */
export interface UnleashedWarehouse {
  Guid: string;
  WarehouseCode: string;
  WarehouseName: string;
  IsDefault: boolean;
}

/** Mirrors Unleashed `/ProductGroups` response item. */
export interface UnleashedProductGroup {
  Guid: string;
  GroupName: string;
}

export interface UnleashedCredentials {
  apiId: string;
  apiKey: string;
  warehouseCode: string;
}

export type SyncStatus = "idle" | "syncing" | "success" | "error";

export interface SyncResult {
  category: UnleashedCategory;
  itemsSynced: number;
  startedAt: string;
  finishedAt: string;
  status: SyncStatus;
  error?: string;
}

export interface SyncState {
  lastSyncAt: string | null;
  status: SyncStatus;
  lastError: string | null;
  results: SyncResult[];
}
