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
  CustomOrderStatus?: string | null;
  OrderDate?: string | null;
  RequiredDate?: string | null;
  DueDate?: string | null;
  Warehouse?: { WarehouseCode?: string; WarehouseName?: string; Guid?: string } | null;
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
  Product?: { Guid?: string; ProductCode?: string } | null;
  BillOfMaterialLines?: UnleashedBomLine[];
  BillOfMaterialsLines?: UnleashedBomLine[];
}

interface UnleashedAssemblyLine {
  ComponentProduct?: { Guid?: string; ProductCode?: string; ProductDescription?: string } | null;
  ComponentQuantity?: number;
  UnitOfMeasure?: { Name?: string } | string | null;
}

interface UnleashedAssembly {
  Guid?: string;
  AssemblyNumber?: string;
  AssemblyStatus?: string;
  AssemblyDate?: string;
  Quantity?: number;
  Comments?: string;
  Product?: { Guid?: string; ProductCode?: string } | null;
  AssemblyLines?: UnleashedAssemblyLine[];
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

  // 1) Fetch all Fill Ready sales orders. In Unleashed this workflow status is
  // exposed as CustomOrderStatus, while OrderStatus remains Parked/Open.
  const orders = await ulFetchAllQueryPages<UnleashedSalesOrder>("/SalesOrders", [
    ["customOrderStatus", FILL_READY],
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
    // Defensive: only act on open Sales Orders whose custom status is Fill Ready.
    if ((so.CustomOrderStatus ?? "").trim() !== FILL_READY) continue;
    if ((so.OrderStatus ?? "").trim().toLowerCase() === "completed") continue;

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
      const bomLines = bom?.BillOfMaterialsLines ?? bom?.BillOfMaterialLines ?? [];
      if (!bom || bomLines.length === 0) {
        throw new Error(`No Bill of Materials found for product ${productCode}`);
      }

      // 4) Find-or-create the linked Assembly in Unleashed.
      //    Match criteria: same product + quantity + comment referencing the SO number.
      let assemblyId: string | null = null;
      let assemblyNumber: string | null = null;
      let assemblyStatus: string | null = null;
      let assemblyCreatedAt: string | null = null;
      let assemblyComponents: Array<{
        productCode: string;
        productGuid?: string;
        name: string;
        quantity: number;
        unit?: string;
      }> = [];

      const existing = await findExistingAssembly(productCode, qty, so.OrderNumber);
      if (existing?.Guid) {
        assemblyId = existing.Guid;
        assemblyNumber = existing.AssemblyNumber ?? null;
        assemblyStatus = existing.AssemblyStatus ?? null;
        assemblyCreatedAt = normaliseUnleashedDate(existing.AssemblyDate);
      } else {
        const assemblyPayload = {
          Quantity: qty,
          Product: { Guid: productGuid },
          SourceWarehouse: so.Warehouse?.WarehouseCode ? { WarehouseCode: so.Warehouse.WarehouseCode } : undefined,
          DestinationWarehouse: so.Warehouse?.WarehouseCode ? { WarehouseCode: so.Warehouse.WarehouseCode } : undefined,
          Comments: `Auto-created by KrystalFlow from Sales Order ${so.OrderNumber}`,
        };
        try {
          const created = await ulPost<UnleashedAssembly>("/Assemblies", assemblyPayload);
          assemblyId = created?.Guid ?? null;
          assemblyNumber = created?.AssemblyNumber ?? null;
          assemblyStatus = created?.AssemblyStatus ?? null;
          assemblyCreatedAt = normaliseUnleashedDate(created?.AssemblyDate) ?? new Date().toISOString();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabase.from("unleashed_sync_log").insert({
            sales_order_id: so.Guid,
            sales_order_number: so.OrderNumber,
            outcome: "error",
            message: `Assembly create failed: ${msg}`,
          });
        }
      }

      // 4b) Fetch the Assembly detail to read its component lines.
      if (assemblyId) {
        try {
          const detail = await fetchAssembly(assemblyId);
          assemblyStatus = detail?.AssemblyStatus ?? assemblyStatus;
          assemblyCreatedAt = normaliseUnleashedDate(detail?.AssemblyDate) ?? assemblyCreatedAt;
          assemblyComponents = (detail?.AssemblyLines ?? []).map((line: UnleashedAssemblyLine) => ({
            productCode: line.ComponentProduct?.ProductCode ?? "",
            productGuid: line.ComponentProduct?.Guid,
            name: line.ComponentProduct?.ProductDescription ?? line.ComponentProduct?.ProductCode ?? "",
            quantity: Number(line.ComponentQuantity ?? 0),
            unit: typeof line.UnitOfMeasure === "string" ? line.UnitOfMeasure : line.UnitOfMeasure?.Name,
          })).filter((c: { productCode: string }) => c.productCode);
        } catch {
          // Fall back to BOM lines if assembly fetch fails.
          assemblyComponents = bomLines.map((line: UnleashedBomLine) => ({
            productCode: line.ComponentProduct?.ProductCode ?? "",
            productGuid: line.ComponentProduct?.Guid,
            name: line.ComponentProduct?.ProductCode ?? "",
            quantity: Number(line.ComponentQuantity ?? 0) * qty,
          })).filter((c: { productCode: string }) => c.productCode);
        }
      } else {
        assemblyComponents = bomLines.map((line: UnleashedBomLine) => ({
          productCode: line.ComponentProduct?.ProductCode ?? "",
          productGuid: line.ComponentProduct?.Guid,
          name: line.ComponentProduct?.ProductCode ?? "",
          quantity: Number(line.ComponentQuantity ?? 0) * qty,
        })).filter((c: { productCode: string }) => c.productCode);
      }



      // 5) Create the production job.
      const scheduledStart = normaliseUnleashedDate(so.OrderDate) ?? new Date().toISOString();
      const dueDate = normaliseUnleashedDate(so.RequiredDate ?? so.DueDate) ?? scheduledStart;

      const { data: jobRows, error: insertError } = await supabase
        .from("production_jobs")
        .insert({
          customer: so.Customer?.CustomerName ?? "Unknown",
          product: productDesc,
          sku: productCode,
          status: "Scheduled",
          operator: "",
          line: "",
          scheduled_start: scheduledStart,
          unleashed_sales_order_id: so.Guid,
          unleashed_sales_order_number: so.OrderNumber,
          unleashed_assembly_id: assemblyId,
          unleashed_assembly_number: assemblyNumber,
          imported_from_unleashed_at: new Date().toISOString(),
          data: {
            customer: so.Customer?.CustomerName ?? "Unknown",
            product: productDesc,
            sku: productCode,
            bottleSize: "",
            quantity: qty,
            pallets: 1,
            dueDate: dueDate.slice(0, 10),
            priority: "Normal",
            line: "",
            operator: "",
            bottlesPerHour: 3000,
            setupMinutes: 30,
            notes: `Imported from Unleashed Sales Order ${so.OrderNumber}`,
            rawMaterial: "Pending",
            labels: "Pending",
            packaging: "Pending",
            status: "Scheduled",
            scheduledStart,
            bottlesCompleted: 0,
            palletsCompleted: 0,
            downtimeMinutes: 0,
            actualRuntimeMinutes: 0,
            customerColor: customerColor(so.Customer?.CustomerName ?? "Unknown"),
            createdAt: new Date().toISOString(),
            importedFromUnleashed: true,
            unleashedSalesOrderNumber: so.OrderNumber,
            unleashedAssemblyNumber: assemblyNumber,
          },
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
  // Unleashed lists BOMs by productGuid; /BillOfMaterials/{guid} expects the BOM guid,
  // not the product guid.
  try {
    const res = await ulFetchRaw<UnleashedBom>("/BillOfMaterials", `productGuid=${productGuid}&pageSize=20`);
    if ((res as any).BillOfMaterialsLines || (res as any).BillOfMaterialLines || (res as any).ProductOfBOM) {
      return res as unknown as UnleashedBom;
    }
    if (res.Items && res.Items.length > 0) return res.Items[0];
    return null;
  } catch {
    return null;
  }
}

function normaliseUnleashedDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function customerColor(customer: string): string {
  const colors = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];
  const idx = Math.abs(customer.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % colors.length;
  return colors[idx];
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
