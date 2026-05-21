// Item catalog used by the Job form dropdowns.
// Mock-first, but shaped so it can later be replaced by a live
// Unleashed product catalog (sku, name, optional pack size).

export interface CatalogItem {
  sku: string;
  name: string;
}

export interface BottleCatalogItem extends CatalogItem {
  size: string; // e.g. "500ml"
}

export interface CartonCatalogItem extends CatalogItem {
  bottlesPerCarton: number;
}

export const BOTTLE_OPTIONS: BottleCatalogItem[] = [
  { sku: "AQP-500", name: "500ml Raw Bottle", size: "500ml" },
  { sku: "AQP-1L", name: "1 Litre Raw Bottle", size: "1L" },
  { sku: "AQP-4L", name: "4 Litre Raw Bottle", size: "4L" },
  { sku: "AQP-5L", name: "5 Litre Raw Bottle", size: "5L" },
];

export const CAP_OPTIONS: CatalogItem[] = [
  { sku: "CAP-28MM", name: "28mm White Screw Cap" },
  { sku: "CAP-38MM", name: "38mm Cap" },
  { sku: "CAP-4L", name: "4L Cap" },
  { sku: "CAP-TRIGGER", name: "Trigger Spray" },
];

export const LABEL_OPTIONS: CatalogItem[] = [
  { sku: "LBL-AQP-500", name: "500ml Label" },
  { sku: "LBL-AQP-1L", name: "1L Label" },
  { sku: "LBL-AQP-4L-F", name: "4L Front Label" },
  { sku: "LBL-AQP-4L-B", name: "4L Back Label" },
];

export const CARTON_OPTIONS: CartonCatalogItem[] = [
  { sku: "BOX-12X500", name: "12 x 500ml Carton", bottlesPerCarton: 12 },
  { sku: "BOX-12X1L", name: "12 x 1L Carton", bottlesPerCarton: 12 },
  { sku: "BOX-4X4L", name: "4 x 4L Carton", bottlesPerCarton: 4 },
];

// Liquid / bulk product to fill — supplied by the customer in IBCs.
// Stock is tracked in litres so the Live Stock Check can compare directly
// against bottle-size × quantity. `litresPerIBC` is informational only.
export interface LiquidCatalogItem extends CatalogItem {
  litresPerIBC: number;
}

export const LIQUID_OPTIONS: LiquidCatalogItem[] = [
  { sku: "LIQ-CUSTA-BLUE", name: "Customer A Blue Detergent IBC", litresPerIBC: 1000 },
  { sku: "LIQ-CUSTB-SAN", name: "Customer B Sanitiser IBC", litresPerIBC: 1000 },
  { sku: "LIQ-CUSTC-FLOOR", name: "Customer C Floor Cleaner IBC", litresPerIBC: 1000 },
  { sku: "LIQ-CUSTD-DEGR", name: "Customer D Degreaser IBC", litresPerIBC: 1000 },
];

// Future swap point — replace with live Unleashed-backed fetchers:
// export async function fetchBottleOptions(): Promise<BottleCatalogItem[]> { ... }
