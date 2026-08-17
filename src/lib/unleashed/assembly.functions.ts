// Per-pallet Unleashed Assembly creation.
//
// Called from the QC dialog after a pallet passes inspection. KrystalFlow
// creates one Assembly per QC-approved pallet (not one big Assembly at SO
// import time) so the master Sales Order stays untouched and stock movements
// match the actual production cadence.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface CreatePalletAssemblyInput {
  jobId: string;
  /** Individual production units (bottles) produced on this pallet. */
  palletQuantity: number;
  /** Bottles per finished product/carton. Defaults to 1 (finished SKU == bottle). */
  unitsPerFinished?: number;
  palletCode?: string;
  autoComplete?: boolean;
}

interface CreatedAssembly {
  assemblyId: string | null;
  assemblyNumber: string | null;
  assemblyStatus: string | null;
  /** Quantity of finished units actually sent to Unleashed. */
  assembledQuantity: number;
}

export const createPalletAssembly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreatePalletAssemblyInput) => {
    if (!data || typeof data.jobId !== "string") throw new Error("jobId is required");
    if (!Number.isFinite(data.palletQuantity) || data.palletQuantity <= 0) {
      throw new Error("palletQuantity must be a positive number");
    }
    const per = data.unitsPerFinished ?? 1;
    if (!Number.isFinite(per) || per <= 0) {
      throw new Error("unitsPerFinished must be a positive number");
    }
    if (!Number.isInteger(data.palletQuantity / per)) {
      throw new Error(
        `Quantity does not match the finished product pack configuration: ${data.palletQuantity} ÷ ${per} is not a whole number of finished units.`,
      );
    }
    return data;
  })

  .handler(async ({ data, context }): Promise<CreatedAssembly> => {
    const { supabase } = context;

    // Load the job to find the Unleashed product + source SO.
    const { data: row, error } = await supabase
      .from("production_jobs")
      .select("sku, data, unleashed_sales_order_number")
      .eq("id", data.jobId)
      .single();
    if (error || !row) throw new Error(`Job not found: ${error?.message ?? data.jobId}`);

    const jobData = (row.data ?? {}) as Record<string, unknown>;
    const productCode = String(row.sku ?? jobData.sku ?? "");
    const soNumber = String(row.unleashed_sales_order_number ?? jobData.unleashedSalesOrderNumber ?? "");
    if (!productCode) throw new Error("Job has no product SKU");

    // Look up the Unleashed product GUID by code so we can post the assembly.
    const { ulFetchRaw, ulPost } = await import("./signed-request.server");
    interface UlProduct { Guid?: string; ProductCode?: string }
    const productResp = await ulFetchRaw<UlProduct>("/Products", `productCode=${productCode}&pageSize=1`);
    const productGuid = productResp.Items?.[0]?.Guid;
    if (!productGuid) throw new Error(`Unleashed product not found for SKU ${productCode}`);

    interface UlAssembly { Guid?: string; AssemblyNumber?: string; AssemblyStatus?: string }
    const commentParts = [
      `Auto-created by KrystalFlow from QC pallet${data.palletCode ? ` ${data.palletCode}` : ""}`,
      soNumber ? `Sales Order ${soNumber}` : null,
    ].filter(Boolean);

    let created: UlAssembly | undefined;
    try {
      created = await ulPost<UlAssembly>("/Assemblies", {
        Quantity: data.palletQuantity,
        Product: { Guid: productGuid },
        Comments: commentParts.join(" — "),
      });
    } catch (e) {
      // Record the failure so it shows up on the Unleashed sync history page
      // instead of vanishing with a dismissed toast.
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("unleashed_sync_log").insert({
        sales_order_id: null,
        sales_order_number: soNumber || null,
        outcome: "error",
        message: `Assembly not created for pallet ${data.palletCode ?? "?"} (qty ${data.palletQuantity}): ${msg}`,
        job_id: data.jobId,
      });
      throw new Error(
        /Assembled Product/i.test(msg)
          ? `Unleashed rejected the assembly: product ${productCode} is not set up as an assembled product (no Bill of Materials). Add a BOM in Unleashed, then retry.`
          : msg,
      );
    }


    let assemblyStatus = created?.AssemblyStatus ?? null;

    // Optionally mark the assembly as Completed so stock movements post.
    if (data.autoComplete && created?.Guid) {
      try {
        const { ulPut } = await import("./signed-request.server");
        const completed = await ulPut<UlAssembly>(`/Assemblies/${created.Guid}`, {
          Guid: created.Guid,
          AssemblyStatus: "Completed",
        });
        assemblyStatus = completed?.AssemblyStatus ?? "Completed";
      } catch {
        /* non-fatal: leave assembly in default state */
      }
    }

    // Log for the sync history page.
    await supabase.from("unleashed_sync_log").insert({
      sales_order_id: null,
      sales_order_number: soNumber || null,
      outcome: "imported",
      message: `Per-pallet Assembly ${created?.AssemblyNumber ?? created?.Guid ?? "created"} (qty ${data.palletQuantity})`,
      job_id: data.jobId,
    });

    return {
      assemblyId: created?.Guid ?? null,
      assemblyNumber: created?.AssemblyNumber ?? null,
      assemblyStatus,
    };
  });
