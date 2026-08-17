// Packaging conversion between individual production units (bottles) and the
// finished product SKU sold/assembled in Unleashed (usually a carton).
//
// KrystalFlow records production in bottles. Unleashed assemblies must be
// posted in finished units, otherwise Unleashed scales the BOM by the bottle
// count (e.g. 864 bottles → 864 cartons → 5,184 bottles consumed).

import type { Job } from "./types";

export interface PackConfig {
  /** Finished product SKU assembled in Unleashed. */
  finishedSku: string;
  /** Bottles (individual production units) per finished unit. */
  unitsPerFinished: number;
  /** Label for the individual production unit. */
  individualUnit: string;
  /** Label for the finished unit. */
  finishedUnit: string;
  /** Human readable pack configuration, e.g. "6 × 500ml". */
  packLabel: string;
}

/** Parse "6 x 500ML", "12X1L", "6X500MLBOTTLEFILL" → 6. */
export function parsePackSize(text: string): number | undefined {
  const m = text.match(/(\d+)\s*[xX×]\s*\d/);
  return m ? Number(m[1]) : undefined;
}

export function getPackConfig(
  job: Pick<Job, "sku" | "product" | "bottleSize" | "bottlesPerCarton">,
): PackConfig {
  const parsed =
    job.bottlesPerCarton && job.bottlesPerCarton > 0
      ? job.bottlesPerCarton
      : parsePackSize(`${job.product ?? ""} ${job.sku ?? ""}`);
  const unitsPerFinished = parsed && parsed > 0 ? parsed : 1;
  return {
    finishedSku: job.sku ?? "",
    unitsPerFinished,
    individualUnit: "Bottle",
    finishedUnit: unitsPerFinished > 1 ? "Carton" : "Bottle",
    packLabel:
      unitsPerFinished > 1
        ? `${unitsPerFinished} × ${job.bottleSize || "unit"}`
        : job.bottleSize || "single unit",
  };
}

export interface AssemblyQuantity {
  unitsProduced: number;
  unitsPerFinished: number;
  /** Exact (possibly fractional) finished quantity. */
  finishedQuantity: number;
  /** True when the produced units divide evenly into finished units. */
  exact: boolean;
}

export function computeAssemblyQuantity(
  unitsProduced: number,
  unitsPerFinished: number,
): AssemblyQuantity {
  const per = unitsPerFinished > 0 ? unitsPerFinished : 1;
  const finishedQuantity = unitsProduced / per;
  return {
    unitsProduced,
    unitsPerFinished: per,
    finishedQuantity,
    exact: Number.isInteger(finishedQuantity) && finishedQuantity > 0,
  };
}
