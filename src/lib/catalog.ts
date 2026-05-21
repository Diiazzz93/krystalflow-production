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

// Future swap point — replace with live Unleashed-backed fetchers:
// export async function fetchBottleOptions(): Promise<BottleCatalogItem[]> { ... }
