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

export type StockStatus = "in-stock" | "low-stock" | "critical-stock" | "out-of-stock";

export type StockCategory =
  | "Bottles"
  | "Caps"
  | "Labels"
  | "Cartons"
  | "Pallets"
  | "Liquid / IBC"
  | "Raw Materials"
  | "Finished Goods"
  | "Other";

export const STOCK_CATEGORIES: StockCategory[] = [
  "Bottles",
  "Caps",
  "Labels",
  "Cartons",
  "Pallets",
  "Liquid / IBC",
  "Raw Materials",
  "Finished Goods",
  "Other",
];

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  availableStock: number;
  allocatedStock: number;
  reorderLevel: number;
  criticalLevel?: number;
  reorderQuantity?: number;
  supplier?: string;
  alertNotes?: string;
  location: string;
  unit: string;
  lastUpdated: string; // ISO
  category?: StockCategory;
  source?: string;
  notes?: string;
  dateReceived?: string;
  /** When set on a finished-product / liquid item, jobs for this product
   *  auto-calculate pallets needed = ceil(cartonsOrdered / boxesPerPallet). */
  boxesPerPallet?: number;
}

export function getStockStatus(item: StockItem): StockStatus {
  if (item.availableStock <= 0) return "out-of-stock";
  if ((item.criticalLevel ?? 0) > 0 && item.availableStock <= (item.criticalLevel ?? 0))
    return "critical-stock";
  if (item.availableStock <= item.reorderLevel) return "low-stock";
  return "in-stock";
}

export function inferCategory(sku: string): StockCategory {
  const s = sku.toUpperCase();
  if (s.startsWith("CAP")) return "Caps";
  if (s.startsWith("LBL")) return "Labels";
  if (s.startsWith("BOX")) return "Cartons";
  if (s.startsWith("PLT")) return "Pallets";
  if (s.startsWith("RAW")) return "Raw Materials";
  if (s.startsWith("LIQ")) return "Liquid / IBC";
  if (s.startsWith("AQP")) return "Bottles";
  return "Other";
}

export function resolveCategory(item: StockItem): StockCategory {
  return item.category ?? inferCategory(item.sku);
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
  {
    id: "stk-009",
    sku: "AQP-4L",
    name: "AquaPure 4L Bottle",
    quantityOnHand: 800,
    availableStock: 500,
    allocatedStock: 300,
    reorderLevel: 400,
    location: "Warehouse A — Bay 3",
    unit: "bottles",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "stk-010",
    sku: "AQP-5L",
    name: "AquaPure 5L Bottle",
    quantityOnHand: 600,
    availableStock: 420,
    allocatedStock: 180,
    reorderLevel: 300,
    location: "Warehouse A — Bay 3",
    unit: "bottles",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: "stk-011",
    sku: "CAP-38MM",
    name: "38mm Cap",
    quantityOnHand: 9000,
    availableStock: 7200,
    allocatedStock: 1800,
    reorderLevel: 3000,
    location: "Warehouse B — Rack 3",
    unit: "caps",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "stk-012",
    sku: "CAP-4L",
    name: "4L Cap",
    quantityOnHand: 2400,
    availableStock: 1800,
    allocatedStock: 600,
    reorderLevel: 1000,
    location: "Warehouse B — Rack 4",
    unit: "caps",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "stk-013",
    sku: "CAP-TRIGGER",
    name: "Trigger Spray",
    quantityOnHand: 1500,
    availableStock: 950,
    allocatedStock: 550,
    reorderLevel: 500,
    location: "Warehouse B — Rack 5",
    unit: "caps",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: "stk-014",
    sku: "LBL-AQP-1L",
    name: "AquaPure 1L Label Roll",
    quantityOnHand: 500,
    availableStock: 350,
    allocatedStock: 150,
    reorderLevel: 300,
    location: "Warehouse B — Rack 1",
    unit: "rolls",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "stk-015",
    sku: "LBL-AQP-4L-F",
    name: "AquaPure 4L Front Label Roll",
    quantityOnHand: 400,
    availableStock: 280,
    allocatedStock: 120,
    reorderLevel: 250,
    location: "Warehouse B — Rack 2",
    unit: "rolls",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "stk-016",
    sku: "LBL-AQP-4L-B",
    name: "AquaPure 4L Back Label Roll",
    quantityOnHand: 380,
    availableStock: 260,
    allocatedStock: 120,
    reorderLevel: 250,
    location: "Warehouse B — Rack 2",
    unit: "rolls",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "stk-017",
    sku: "BOX-12X500",
    name: "Cardboard Box (12x500ml)",
    quantityOnHand: 2200,
    availableStock: 1700,
    allocatedStock: 500,
    reorderLevel: 600,
    location: "Warehouse C — Pallet 3",
    unit: "boxes",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "stk-018",
    sku: "BOX-4X4L",
    name: "Cardboard Box (4x4L)",
    quantityOnHand: 900,
    availableStock: 650,
    allocatedStock: 250,
    reorderLevel: 300,
    location: "Warehouse C — Pallet 5",
    unit: "boxes",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "stk-019",
    sku: "LIQ-CUSTA-BLUE",
    name: "Customer A Blue Detergent IBC",
    quantityOnHand: 1500,
    availableStock: 1200,
    allocatedStock: 300,
    reorderLevel: 1000,
    location: "Bulk Storage — Tank 3",
    unit: "L",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "stk-020",
    sku: "LIQ-CUSTB-SAN",
    name: "Customer B Sanitiser IBC",
    quantityOnHand: 3000,
    availableStock: 2500,
    allocatedStock: 500,
    reorderLevel: 1000,
    location: "Bulk Storage — Tank 4",
    unit: "L",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "stk-021",
    sku: "LIQ-CUSTC-FLOOR",
    name: "Customer C Floor Cleaner IBC",
    quantityOnHand: 2000,
    availableStock: 1800,
    allocatedStock: 200,
    reorderLevel: 800,
    location: "Bulk Storage — Tank 5",
    unit: "L",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "stk-022",
    sku: "LIQ-CUSTD-DEGR",
    name: "Customer D Degreaser IBC",
    quantityOnHand: 800,
    availableStock: 600,
    allocatedStock: 200,
    reorderLevel: 1000,
    location: "Bulk Storage — Tank 6",
    unit: "L",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
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
