// Stock data structured for future Unleashed API integration.
// Field names mirror common Unleashed Product / StockOnHand response shapes
// so we can swap mock data for live API responses with minimal refactor.
//
// Unleashed reference fields (kept here for traceability):
//   ProductCode      -> sku
//   ProductDescription -> name
//   QtyOnHand        -> quantityOnHand
//   AvailableQty     -> availableStock
//   AllocatedQty     -> allocatedStock
//   MinStockAlertLevel -> reorderLevel
//   Warehouse.WarehouseName -> location
//   LastModifiedOn   -> lastUpdated

export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  availableStock: number;
  allocatedStock: number;
  reorderLevel: number;
  location: string;
  unit: string;
  lastUpdated: string; // ISO
}

export function getStockStatus(item: StockItem): StockStatus {
  if (item.availableStock <= 0) return "out-of-stock";
  if (item.availableStock <= item.reorderLevel) return "low-stock";
  return "in-stock";
}

export const MOCK_STOCK: StockItem[] = [
  {
    id: "stk-001",
    sku: "AQP-500",
    name: "AquaPure 500ml Bottle",
    quantityOnHand: 4800,
    availableStock: 3200,
    allocatedStock: 1600,
    reorderLevel: 1500,
    location: "Warehouse A — Bay 1",
    unit: "bottles",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "stk-002",
    sku: "AQP-1L",
    name: "AquaPure 1L Bottle",
    quantityOnHand: 2200,
    availableStock: 900,
    allocatedStock: 1300,
    reorderLevel: 1000,
    location: "Warehouse A — Bay 2",
    unit: "bottles",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "stk-003",
    sku: "CAP-28MM",
    name: "28mm White Screw Cap",
    quantityOnHand: 18500,
    availableStock: 12500,
    allocatedStock: 6000,
    reorderLevel: 5000,
    location: "Warehouse B — Rack 3",
    unit: "caps",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "stk-004",
    sku: "LBL-AQP-500",
    name: "AquaPure 500ml Label Roll",
    quantityOnHand: 600,
    availableStock: 200,
    allocatedStock: 400,
    reorderLevel: 500,
    location: "Warehouse B — Rack 1",
    unit: "rolls",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "stk-005",
    sku: "RAW-CHM-A",
    name: "Cleaning Concentrate A (IBC)",
    quantityOnHand: 12,
    availableStock: 8,
    allocatedStock: 4,
    reorderLevel: 3,
    location: "Bulk Storage — Tank 1",
    unit: "IBC",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "stk-006",
    sku: "RAW-CHM-B",
    name: "Sanitiser Base B",
    quantityOnHand: 0,
    availableStock: 0,
    allocatedStock: 0,
    reorderLevel: 5,
    location: "Bulk Storage — Tank 2",
    unit: "IBC",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: "stk-007",
    sku: "BOX-12X1L",
    name: "Cardboard Box (12x1L)",
    quantityOnHand: 3400,
    availableStock: 2800,
    allocatedStock: 600,
    reorderLevel: 800,
    location: "Warehouse C — Pallet 4",
    unit: "boxes",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "stk-008",
    sku: "PLT-EUR",
    name: "Euro Pallet",
    quantityOnHand: 140,
    availableStock: 120,
    allocatedStock: 20,
    reorderLevel: 50,
    location: "Yard",
    unit: "pallets",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
];

// Future swap point:
// export async function fetchStock(): Promise<StockItem[]> {
//   const res = await fetch("/api/unleashed/stock");
//   return res.json();
// }
export async function fetchStock(): Promise<StockItem[]> {
  return MOCK_STOCK;
}
