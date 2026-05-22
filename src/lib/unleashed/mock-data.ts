// Mock Unleashed API responses.
// Shaped exactly like real Unleashed `/Products`, `/StockOnHand`,
// and `/Warehouses` responses so a future swap to live data is a drop-in.

import type {
  UnleashedCategory,
  UnleashedProduct,
  UnleashedStockOnHand,
  UnleashedWarehouse,
} from "./types";
import { MOCK_STOCK } from "../stock";

export const MOCK_WAREHOUSES: UnleashedWarehouse[] = [
  { Guid: "wh-001", WarehouseCode: "MAIN", WarehouseName: "Main Warehouse", IsDefault: true },
  { Guid: "wh-002", WarehouseCode: "BULK", WarehouseName: "Bulk Storage", IsDefault: false },
  { Guid: "wh-003", WarehouseCode: "PACK", WarehouseName: "Packaging Store", IsDefault: false },
];

function categoryFromSku(sku: string): UnleashedCategory {
  if (sku.startsWith("LIQ-") || sku.startsWith("RAW-")) return "liquid";
  if (sku.startsWith("CAP-")) return "cap";
  if (sku.startsWith("LBL-")) return "label";
  if (sku.startsWith("BOX-") || sku.startsWith("PLT-")) return "carton";
  if (sku.startsWith("AQP-")) return "bottle";
  return "product";
}

export const MOCK_PRODUCTS: UnleashedProduct[] = MOCK_STOCK.map((s) => ({
  Guid: s.id,
  ProductCode: s.sku,
  ProductDescription: s.name,
  ProductGroup: { GroupName: categoryFromSku(s.sku) },
  UnitOfMeasure: { Name: s.unit },
  LovableCategory: categoryFromSku(s.sku),
  LastModifiedOn: s.lastUpdated,
}));

export const MOCK_STOCK_ON_HAND: UnleashedStockOnHand[] = MOCK_STOCK.map((s) => ({
  ProductCode: s.sku,
  ProductDescription: s.name,
  QtyOnHand: s.quantityOnHand,
  AvailableQty: s.availableStock,
  AllocatedQty: s.allocatedStock,
  MinStockAlertLevel: s.reorderLevel,
  Warehouse: { WarehouseCode: "MAIN", WarehouseName: "Main Warehouse" },
  LastModifiedOn: s.lastUpdated,
}));
