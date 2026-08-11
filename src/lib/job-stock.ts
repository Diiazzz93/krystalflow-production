import type { Job } from "@/lib/types";
import type { StockItem } from "@/lib/stock";
import { originalQuantity, remainingQuantity } from "@/lib/utils-domain";

export interface SkuAllocation {
  jobId: string;
  salesOrderNumber?: string;
  customer?: string;
  product?: string;
  status: Job["status"];
  scheduledStart?: string;
  required: number;
  unit: string;
}

/**
 * Find all active (non-Complete) jobs whose computed material requirements
 * include the given SKU. Used to show "where is this stock tied up".
 */
export function findJobsAllocatingSku(
  jobs: Job[],
  sku: string,
  stock: StockItem[],
  excludeJobId?: string,
): SkuAllocation[] {
  const target = sku.trim().toUpperCase();
  if (!target) return [];
  const allocations: SkuAllocation[] = [];
  for (const job of jobs) {
    if (job.id === excludeJobId) continue;
    if (job.status === "Complete") continue;
    const check = computeJobStockCheck(job, stock);
    for (const req of check.requirements) {
      const reqSku = req.stock?.sku?.toUpperCase();
      if (reqSku === target && req.required > 0) {
        allocations.push({
          jobId: job.id,
          salesOrderNumber: job.unleashedSalesOrderNumber,
          customer: job.customer,
          product: job.product,
          status: job.status,
          scheduledStart: job.scheduledStart,
          required: req.required,
          unit: req.unit,
        });
        break;
      }
    }
  }
  // Sort by scheduled start (soonest first), unscheduled last.
  allocations.sort((a, b) => {
    const at = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
    const bt = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
    return at - bt;
  });
  return allocations;
}




export type RequirementCategory = "bottle" | "cap" | "label" | "carton" | "liquid" | `assembly-${string}`;

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
  hasSelections: boolean;
  ready: boolean; // true when no requirement is short
  hasLow: boolean; // any item below 1.2x of need
  hasShort: boolean; // any item below need
  shortCount: number;
}

// Default bottles per carton — can be overridden per-job.
const DEFAULT_BOTTLES_PER_CARTON = 12;

// Parse strings like "500ml", "1L", "4 Litre", "5 L" into litres.
function parseBottleSizeLitres(size?: string): number {
  if (!size) return 0;
  const s = size.toString().trim().toLowerCase();
  const m = s.match(/([\d.]+)\s*(ml|l|litre|liter)?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = m[2] ?? (s.includes("ml") ? "ml" : "l");
  return unit === "ml" ? n / 1000 : n;
}

function findStockFor(
  category: RequirementCategory,
  job: Job,
  stock: StockItem[],
): StockItem | null {
  const override =
    category === "bottle" ? job.bottleSku
      : category === "cap" ? job.capSku
      : category === "label" ? job.labelSku
      : category === "carton" ? job.cartonSku
      : category === "liquid" ? job.liquidSku
      : undefined;
  if (!override) return null;
  return stock.find((s) => s.sku.toUpperCase() === override.toUpperCase()) ?? null;
}

export function computeJobStockCheck(
  job: Job,
  stock: StockItem[] = [],
): JobStockCheck {
  const assemblyComponents = job.assemblyComponents ?? [];
  // Scale requirements by remaining / original so stock checks track what's
  // still to be produced, not the entire Sales Order.
  const orig = originalQuantity(job);
  const remaining = remainingQuantity(job);
  const remainingRatio = orig > 0 ? remaining / orig : 1;
  if (assemblyComponents.length > 0) {
    const stockBySku = new Map(stock.map((item) => [item.sku.toLowerCase(), item]));
    const requirements: JobRequirement[] = assemblyComponents.map((component, index) => {
      const item = stockBySku.get((component.productCode ?? "").toLowerCase()) ?? null;
      const fullRequired = Math.max(0, Number(component.quantity ?? 0));
      const required = Math.ceil(fullRequired * remainingRatio);
      const available = item?.availableStock ?? 0;
      const missing = Math.max(0, required - available);
      const status: JobRequirement["status"] =
        missing > 0 ? "short" : available < required * 1.2 ? "low" : "ok";
      return {
        category: `assembly-${component.productCode || index}`,
        description: component.name || component.productCode || "Assembly component",
        required,
        unit: component.unit ?? item?.unit ?? "units",
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
      hasSelections: true,
      ready: !hasShort,
      hasLow,
      hasShort,
      shortCount: requirements.filter((r) => r.status === "short").length,
    };
  }

  // Base remaining-bottle math for the non-assembly path.
  const qty = remaining > 0 ? remaining : Math.max(0, job.quantity ?? 0);
  const perCarton = Math.max(1, job.bottlesPerCarton ?? DEFAULT_BOTTLES_PER_CARTON);
  const cartons = Math.ceil(qty / perCarton);
  const litresPerBottle = parseBottleSizeLitres(job.bottleSize);
  const litresRequired = Math.ceil(litresPerBottle * qty);


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
    {
      category: "liquid",
      description: "Liquid / product to fill",
      required: litresRequired,
      unit: "L",
    },
  ];

  const selectedCategories = new Set<RequirementCategory>();
  if (job.bottleSku) selectedCategories.add("bottle");
  if (job.capSku) selectedCategories.add("cap");
  if (job.labelSku) selectedCategories.add("label");
  if (job.cartonSku) selectedCategories.add("carton");
  if (job.liquidSku) selectedCategories.add("liquid");

  const requirements: JobRequirement[] = blueprint.filter((b) => selectedCategories.has(b.category)).map((b) => {
    const item = findStockFor(b.category, job, stock);
    const available = item?.availableStock ?? 0;
    const missing = Math.max(0, b.required - available);
    const status: JobRequirement["status"] =
      missing > 0 ? "short" : available < b.required * 1.2 ? "low" : "ok";
    return {
      ...b,
      description: item?.name ?? b.description,
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
    hasSelections: selectedCategories.size > 0,
    ready: requirements.length > 0 && !hasShort,
    hasLow,
    hasShort,
    shortCount: requirements.filter((r) => r.status === "short").length,
  };
}
