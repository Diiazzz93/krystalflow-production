// Look up open Unleashed assemblies that allocate a given component SKU.
// Used by the StockAllocationPopover to explain shortfalls when no
// KrystalFlow job is consuming the stock.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface UnleashedAllocation {
  assemblyNumber: string | null;
  assemblyStatus: string | null;
  productCode: string | null;
  productDescription: string | null;
  assemblyQuantity: number;
  componentQuantity: number;
  unit: string | null;
  dueDate: string | null;
}

interface Input {
  sku: string;
}

interface UlAssemblyLine {
  Product?: { ProductCode?: string };
  Quantity?: number;
  Measure?: string;
}

interface UlAssembly {
  AssemblyNumber?: string;
  AssemblyStatus?: string;
  Quantity?: number;
  AssemblyDate?: string;
  DueDate?: string;
  Product?: { ProductCode?: string; ProductDescription?: string };
  AssemblyLines?: UlAssemblyLine[];
}

export const fetchUnleashedAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data || typeof data.sku !== "string" || !data.sku.trim()) {
      throw new Error("sku is required");
    }
    return { sku: data.sku.trim() };
  })
  .handler(async ({ data }): Promise<UnleashedAllocation[]> => {
    const target = data.sku.toUpperCase();
    const { ulFetchAllQueryPages } = await import("./signed-request.server");

    // Pull open + parked assemblies (in-flight production).
    const statuses = ["Open", "Parked"];
    const results: UlAssembly[] = [];
    for (const status of statuses) {
      try {
        const page = await ulFetchAllQueryPages<UlAssembly>(
          "/Assemblies",
          [["assemblyStatus", status], ["pageSize", "200"]],
          5,
        );
        results.push(...page);
      } catch {
        /* ignore one status failure */
      }
    }

    const allocations: UnleashedAllocation[] = [];
    for (const a of results) {
      const matching = (a.AssemblyLines ?? []).find(
        (l) => (l.Product?.ProductCode ?? "").toUpperCase() === target,
      );
      if (!matching) continue;
      allocations.push({
        assemblyNumber: a.AssemblyNumber ?? null,
        assemblyStatus: a.AssemblyStatus ?? null,
        productCode: a.Product?.ProductCode ?? null,
        productDescription: a.Product?.ProductDescription ?? null,
        assemblyQuantity: Number(a.Quantity ?? 0),
        componentQuantity: Number(matching.Quantity ?? 0),
        unit: matching.Measure ?? null,
        dueDate: a.DueDate ?? a.AssemblyDate ?? null,
      });
    }

    allocations.sort((x, y) => {
      const xt = x.dueDate ? new Date(x.dueDate).getTime() : Infinity;
      const yt = y.dueDate ? new Date(y.dueDate).getTime() : Infinity;
      return xt - yt;
    });
    return allocations;
  });
