// Core Fill Ready import logic, runnable from either an authenticated
// server function (acting as a user) or from the cron route (using the
// admin client). Keep this file isolated from any browser-reachable
// import path — only `.server.ts` and route handlers may import it.

import { ulFetchAllQueryPages, ulFetchRaw, ulPost } from "./signed-request.server";

interface UnleashedSalesOrderLine {
  Guid?: string;
  LineNumber?: number;
  Product?: { Guid?: string; ProductCode?: string; ProductDescription?: string } | null;
  OrderQuantity?: number;
}

interface UnleashedSalesOrder {
  Guid: string;
  OrderNumber: string;
  OrderStatus: string;
  Customer?: { CustomerName?: string; CustomerCode?: string } | null;
  SalesOrderLines?: UnleashedSalesOrderLine[];
}

interface UnleashedBomLine {
  ComponentProduct?: { Guid?: string; ProductCode?: string } | null;
  ComponentQuantity?: number;
}

interface UnleashedBom {
  Guid?: string;
  ProductOfBOM?: { Guid?: string; ProductCode?: string } | null;
  BillOfMaterialLines?: UnleashedBomLine[];
}

interface SupabaseLike {
  from(table: string): {
    select: (cols?: string) => any;
    insert: (rows: any) => any;
    update: (vals: any) => any;
    eq: (col: string, val: any) => any;
  };
}

export interface ImportSummary {
  fetched: number;
  imported: number;
  skipped: number;
  errors: number;
  details: Array<{
    salesOrderNumber: string;
    outcome: "imported" | "skipped" | "error";
    message: string;
  }>;
}

const FILL_READY = "Fill Ready";

export async function importFillReadyImpl(supabase: SupabaseLike): Promise<ImportSummary> {
  const summary: ImportSummary = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // 1) Fetch all Fill Ready sales orders.
  const orders = await ulFetchAllQueryPages<UnleashedSalesOrder>("/SalesOrders", [
    ["orderStatus", FILL_READY],
    ["pageSize", "200"],
  ]);
  summary.fetched = orders.length;

  if (orders.length === 0) return summary;

  // 2) Pre-load existing imported SO ids to avoid duplicate work.
  const existingIds = new Set<string>();
  {
    const { data, error } = await supabase
      .from("production_jobs")
      .select("unleashed_sales_order_id");
    if (!error && data) {
      for (const row of data) {
        if (row.unleashed_sales_order_id) existingIds.add(String(row.unleashed_sales_order_id));
      }
    }
  }

  for (const so of orders) {
    // Defensive: only act on Fill Ready (server filter should already do this).
    if ((so.OrderStatus ?? "").trim() !== FILL_READY) continue;

    if (existingIds.has(so.Guid)) {
      summary.skipped++;
      summary.details.push({
        salesOrderNumber: so.OrderNumber,
        outcome: "skipped",
        message: "Already imported",
      });
      await supabase.from("unleashed_sync_log").insert({
        sales_order_id: so.Guid,
        sales_order_number: so.OrderNumber,
        outcome: "skipped",
        message: "Already imported",
      });
      continue;
    }

    try {
      // Pick the primary line: largest order quantity wins.
      const lines = (so.SalesOrderLines ?? []).filter((l) => l.Product?.Guid);
      if (lines.length === 0) throw new Error("Sales order has no product lines");
      lines.sort((a, b) => (b.OrderQuantity ?? 0) - (a.OrderQuantity ?? 0));
      const primary = lines[0];
      const productGuid = primary.Product!.Guid!;
      const productCode = primary.Product!.ProductCode ?? "";
      const productDesc = primary.Product!.ProductDescription ?? productCode;
      const qty = Number(primary.OrderQuantity ?? 0);

      // 3) Fetch BOM for the product. Fail import if none.
      const bom = await fetchBom(productGuid);
      if (!bom || !(bom.BillOfMaterialLines && bom.BillOfMaterialLines.length > 0)) {
        throw new Error(`No Bill of Materials found for product ${productCode}`);
      }

      // 4) Create the linked Assembly in Unleashed.
      const { randomUUID } = await import("crypto");
      const assemblyGuid = randomUUID();
      const assemblyPayload = {
        Guid: assemblyGuid,
        AssemblyNumber: `KF-${so.OrderNumber}`,
        AssemblyDate: new Date().toISOString(),
        AssemblyQuantity: qty,
        Product: { Guid: productGuid },
        Status: "Parked",
        Comments: `Auto-created by KrystalFlow from Sales Order ${so.OrderNumber}`,
      };
      let assemblyId: string | null = null;
      let assemblyNumber: string | null = null;
      try {
        const created = await ulPost<{ Guid?: string; AssemblyNumber?: string }>(
          `/Assemblies/${assemblyGuid}`,
          assemblyPayload,
        );
        assemblyId = created?.Guid ?? assemblyGuid;
        assemblyNumber = created?.AssemblyNumber ?? assemblyPayload.AssemblyNumber;
      } catch (e) {
        // Surface but continue — we still want the Job created so production can run.
        // Approvers will see the missing assembly id and can retry.
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("unleashed_sync_log").insert({
          sales_order_id: so.Guid,
          sales_order_number: so.OrderNumber,
          outcome: "error",
          message: `Assembly create failed: ${msg}`,
        });
      }

      // 5) Create the production job.
      const { data: jobRows, error: insertError } = await supabase
        .from("production_jobs")
        .insert({
          customer: so.Customer?.CustomerName ?? "Unknown",
          product: productDesc,
          sku: productCode,
          status: "Scheduled",
          operator: "",
          line: "",
          unleashed_sales_order_id: so.Guid,
          unleashed_sales_order_number: so.OrderNumber,
          unleashed_assembly_id: assemblyId,
          unleashed_assembly_number: assemblyNumber,
          imported_from_unleashed_at: new Date().toISOString(),
          data: { quantity: qty, importedFromUnleashed: true },
        })
        .select("id")
        .single();

      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

      summary.imported++;
      summary.details.push({
        salesOrderNumber: so.OrderNumber,
        outcome: "imported",
        message: assemblyId
          ? `Job created, Assembly ${assemblyNumber}`
          : "Job created (Assembly not created)",
      });
      await supabase.from("unleashed_sync_log").insert({
        sales_order_id: so.Guid,
        sales_order_number: so.OrderNumber,
        outcome: "imported",
        message: assemblyNumber ? `Assembly ${assemblyNumber}` : "Assembly not created",
        job_id: jobRows?.id,
      });
      existingIds.add(so.Guid);
    } catch (e) {
      summary.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      summary.details.push({
        salesOrderNumber: so.OrderNumber,
        outcome: "error",
        message: msg,
      });
      await supabase.from("unleashed_sync_log").insert({
        sales_order_id: so.Guid,
        sales_order_number: so.OrderNumber,
        outcome: "error",
        message: msg,
      });
    }
  }

  return summary;
}

async function fetchBom(productGuid: string): Promise<UnleashedBom | null> {
  // Unleashed exposes BOM under /BillOfMaterials/{productGuid}.
  try {
    const res = await ulFetchRaw<UnleashedBom>(`/BillOfMaterials/${productGuid}`, "");
    // The endpoint returns the BOM object directly (not Items). Use the raw body via a re-fetch.
    // Workaround: re-fetch without the Items wrapper assumption.
    if ((res as any).BillOfMaterialLines || (res as any).ProductOfBOM) {
      return res as unknown as UnleashedBom;
    }
    if (res.Items && res.Items.length > 0) return res.Items[0];
    return null;
  } catch {
    return null;
  }
}

export async function completeAssemblyImpl(
  supabase: SupabaseLike,
  jobId: string,
  approverUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: job, error } = await supabase
    .from("production_jobs")
    .select("id, unleashed_assembly_id, unleashed_assembly_number")
    .eq("id", jobId)
    .single();
  if (error || !job) return { ok: false, error: error?.message ?? "Job not found" };
  if (!job.unleashed_assembly_id) {
    return { ok: false, error: "Job has no linked Unleashed Assembly" };
  }

  try {
    await ulPost(`/Assemblies/${job.unleashed_assembly_id}/Complete`, {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Unleashed completion failed: ${msg}` };
  }

  const { error: updateError } = await supabase
    .from("production_jobs")
    .update({
      status: "Assembly Completed",
      assembly_approved_by: approverUserId,
      assembly_approved_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}
