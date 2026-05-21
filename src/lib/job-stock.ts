// Job ↔ stock requirement engine.
// Mock-first, but shaped so that swapping `MOCK_STOCK` for the real
// Unleashed-backed list keeps the consumer code identical.

import type { Job } from "@/lib/types";
import { MOCK_STOCK, type StockItem } from "@/lib/stock";

export type RequirementCategory = "bottle" | "cap" | "label" | "carton" | "liquid";

export interface JobRequirement {
  category: RequirementCategory;
  description: string;
  required: number;
  unit: string;
  // Resolved stock item used to fulfil this requirement (best-effort match).
  stock: StockItem | null;
  available: number;
  missing: number; // 0 when satisfied
  status: "ok" | "low" | "short";
}

export interface JobStockCheck {
  jobId: string;
  requirements: JobRequirement[];
  ready: boolean; // true when no requirement is short
  hasLow: boolean; // any item below 1.2x of need
  hasShort: boolean; // any item below need
  shortCount: number;
}

// Default bottles per carton — can be overridden per-job.
const DEFAULT_BOTTLES_PER_CARTON = 12;

function findStockFor(
  category: RequirementCategory,
  job: Job,
  stock: StockItem[],
): StockItem | null {
  const sku = job.sku?.toUpperCase() ?? "";
  const product = job.product?.toUpperCase() ?? "";

  // Explicit overrides on the job take precedence.
  const override =
    category === "bottle" ? job.bottleSku
      : category === "cap" ? job.capSku
      : category === "label" ? job.labelSku
      : category === "carton" ? job.cartonSku
      : category === "liquid" ? job.liquidSku
      : undefined;
  if (override) {
    const m = stock.find((s) => s.sku.toUpperCase() === override.toUpperCase());
    if (m) return m;
  }

  // Prefer items whose SKU references the job's SKU (e.g. LBL-AQP-500 for AQP-500).
  const direct = stock.find((s) => {
    const ssku = s.sku.toUpperCase();
    if (category === "bottle") {
      return sku && (ssku === sku || ssku.endsWith(sku));
    }
    if (category === "label") {
      return sku && ssku.includes(sku) && ssku.startsWith("LBL");
    }
    return false;
  });
  if (direct) return direct;

  // Category fallbacks by SKU prefix / name keyword.
  const byCategory = stock.find((s) => {
    const ssku = s.sku.toUpperCase();
    const sname = s.name.toUpperCase();
    switch (category) {
      case "bottle":
        return (
          ssku.startsWith("AQP") ||
          sname.includes("BOTTLE") ||
          (product && sname.includes(product))
        );
      case "cap":
        return ssku.startsWith("CAP") || sname.includes("CAP");
      case "label":
        return ssku.startsWith("LBL") || sname.includes("LABEL");
      case "carton":
        return (
          ssku.startsWith("BOX") || sname.includes("BOX") || sname.includes("CARTON")
        );
    }
  });
  return byCategory ?? null;
}

export function computeJobStockCheck(
  job: Job,
  stock: StockItem[] = MOCK_STOCK,
): JobStockCheck {
  const qty = Math.max(0, job.quantity ?? 0);
  const perCarton = Math.max(1, job.bottlesPerCarton ?? DEFAULT_BOTTLES_PER_CARTON);
  const cartons = Math.ceil(qty / perCarton);

  const blueprint: Array<{
    category: RequirementCategory;
    description: string;
    required: number;
    unit: string;
  }> = [
    {
      category: "bottle",
      description: `${job.bottleSize ?? ""} bottles`.trim(),
      required: qty,
      unit: "bottles",
    },
    { category: "cap", description: "Caps", required: qty, unit: "caps" },
    { category: "label", description: "Labels", required: qty, unit: "labels" },
    { category: "carton", description: "Cartons", required: cartons, unit: "boxes" },
  ];

  const requirements: JobRequirement[] = blueprint.map((b) => {
    const item = findStockFor(b.category, job, stock);
    const available = item?.availableStock ?? 0;
    const missing = Math.max(0, b.required - available);
    const status: JobRequirement["status"] =
      missing > 0 ? "short" : available < b.required * 1.2 ? "low" : "ok";
    return {
      ...b,
      stock: item,
      available,
      missing,
      status,
    };
  });

  const hasShort = requirements.some((r) => r.status === "short");
  const hasLow = requirements.some((r) => r.status === "low");

  return {
    jobId: job.id,
    requirements,
    ready: !hasShort,
    hasLow,
    hasShort,
    shortCount: requirements.filter((r) => r.status === "short").length,
  };
}
