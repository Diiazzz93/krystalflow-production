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
  Product?: { Guid?: string; ProductCode?: string; ProductDescription?: string } | null;
  ComponentProduct?: { Guid?: string; ProductCode?: string; ProductDescription?: string } | null;
  Quantity?: number;
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
      // The SO OrderQuantity is in the product's stock unit (cartons for boxed
      // SKUs like "Linseed Oil Raw 6 x 1L"). The Unleashed Assembly is also
      // sized in that same unit, so `qty` (used for BOM/Assembly) stays as-is.
      const qty = Number(primary.OrderQuantity ?? 0);
      // Detect pack format from the product name so the production job can
      // show the true number of bottles to fill (e.g. 672 boxes × 6 = 4032).
      const pack = parseProductPackaging(productDesc);
      const bottlesPerCarton = pack.bottlesPerCarton;
      const isBoxedProduct = bottlesPerCarton > 1;
      const bottleCount = isBoxedProduct ? qty * bottlesPerCarton : qty;
      const bottleSize = pack.bottleSize ?? "";
      const unitLabel = isBoxedProduct
        ? `${qty} box${qty === 1 ? "" : "es"} of ${bottlesPerCarton}${bottleSize ? ` × ${bottleSize}` : ""} = ${bottleCount} bottles`
        : `${bottleCount} bottles`;

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
          assemblyComponents = mapAssemblyComponents(detail?.AssemblyLines);
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
            bottleSize,
            quantity: bottleCount,
            bottlesPerCarton: isBoxedProduct ? bottlesPerCarton : undefined,
            cartonsOrdered: isBoxedProduct ? qty : undefined,
            pallets: 1,
            dueDate: dueDate.slice(0, 10),
            priority: "Normal",
            line: "",
            operator: "",
            bottlesPerHour: 3000,
            setupMinutes: 30,
            notes: `Imported from Unleashed Sales Order ${so.OrderNumber} — ${unitLabel}`,
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
            assemblyComponents,
            assemblyStatus,
            assemblyCreatedAt,
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

  // Backfill pass: existing jobs that have a linked assembly but no components
  // captured in their data jsonb (created by earlier versions of the importer).
  try {
    const { data: backfillRows } = await supabase
      .from("production_jobs")
      .select("id, unleashed_assembly_id, unleashed_assembly_number, unleashed_sales_order_number, data");
    const rows = (backfillRows ?? []) as Array<{
      id: string;
      unleashed_assembly_id?: string | null;
      unleashed_assembly_number?: string | null;
      unleashed_sales_order_number?: string | null;
      data?: Record<string, unknown> | null;
    }>;
    for (const row of rows) {
      if (!row.unleashed_assembly_id) continue;
      const data = (row.data ?? {}) as Record<string, unknown>;
      const existingComponents = data.assemblyComponents as unknown[] | undefined;
      if (existingComponents && existingComponents.length > 0) continue;
      try {
        const detail = await fetchAssembly(row.unleashed_assembly_id);
        if (!detail) continue;
        const components = mapAssemblyComponents(detail.AssemblyLines);
        const merged = {
          ...data,
          assemblyComponents: components,
          assemblyStatus: detail.AssemblyStatus ?? (data.assemblyStatus as string | undefined) ?? null,
          assemblyCreatedAt: normaliseUnleashedDate(detail.AssemblyDate) ?? (data.assemblyCreatedAt as string | undefined) ?? null,
          unleashedAssemblyNumber: row.unleashed_assembly_number ?? (data.unleashedAssemblyNumber as string | undefined),
          unleashedSalesOrderNumber: row.unleashed_sales_order_number ?? (data.unleashedSalesOrderNumber as string | undefined),
        };
        await supabase.from("production_jobs").update({ data: merged }).eq("id", row.id);
      } catch {
        /* continue */
      }
    }
  } catch {
    /* ignore backfill errors */
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
  const match = value.match(/^\/Date\((\d+)\)\/$/);
  if (match) return new Date(Number(match[1])).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function customerColor(customer: string): string {
  const colors = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];
  const idx = Math.abs(customer.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % colors.length;
  return colors[idx];
}

function mapAssemblyComponents(lines?: UnleashedAssemblyLine[]) {
  return (lines ?? [])
    .map((line) => {
      const product = line.Product ?? line.ComponentProduct;
      return {
        productCode: product?.ProductCode ?? "",
        productGuid: product?.Guid,
        name: product?.ProductDescription ?? product?.ProductCode ?? "",
        quantity: Number(line.Quantity ?? line.ComponentQuantity ?? 0),
        unit: typeof line.UnitOfMeasure === "string" ? line.UnitOfMeasure : line.UnitOfMeasure?.Name,
      };
    })
    .filter((c) => c.productCode);
}

/**
 * Detect carton/pack format from an Unleashed product description.
 * Examples:
 *   "Linseed Oil Raw 6 x 1L"   → { bottlesPerCarton: 6,  bottleSize: "1L"    }
 *   "Citrus Cleaner 4x4 litre" → { bottlesPerCarton: 4,  bottleSize: "4L"    }
 *   "Spray 12 x 500ml"         → { bottlesPerCarton: 12, bottleSize: "500ml" }
 *   "Single 5L Bottle"         → { bottlesPerCarton: 1,  bottleSize: "5L"    }
 */
export function parseProductPackaging(desc: string): {
  bottlesPerCarton: number;
  bottleSize?: string;
} {
  if (!desc) return { bottlesPerCarton: 1 };
  const text = desc.toLowerCase();

  const pack = text.match(
    /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|millilitre|millilitres|l|lt|ltr|litre|litres|liter|liters|kg|g|gram|grams)\b/,
  );
  if (pack) {
    const count = Number(pack[1]);
    const size = Number(pack[2]);
    const unit = normaliseUnit(pack[3]);
    if (count > 0 && size > 0) {
      return { bottlesPerCarton: count, bottleSize: `${size}${unit}` };
    }
  }

  const single = text.match(
    /(\d+(?:\.\d+)?)\s*(ml|millilitre|millilitres|l|lt|ltr|litre|litres|liter|liters|kg|g|gram|grams)\b/,
  );
  if (single) {
    const size = Number(single[1]);
    const unit = normaliseUnit(single[2]);
    if (size > 0) return { bottlesPerCarton: 1, bottleSize: `${size}${unit}` };
  }

  return { bottlesPerCarton: 1 };
}

function normaliseUnit(u: string): string {
  const s = u.toLowerCase();
  if (s.startsWith("ml") || s.startsWith("milli")) return "ml";
  if (s === "l" || s === "lt" || s === "ltr" || s.startsWith("litre") || s.startsWith("liter")) return "L";
  if (s === "kg") return "kg";
  if (s === "g" || s.startsWith("gram")) return "g";
  return s;
}

async function findExistingAssembly(
  productCode: string,
  qty: number,
  orderNumber: string,
): Promise<UnleashedAssembly | null> {
  if (!productCode) return null;
  try {
    const items = await ulFetchAllQueryPages<UnleashedAssembly>("/Assemblies", [
      ["productCode", productCode],
      ["pageSize", "200"],
    ], 3);
    const match = items.find((a) => {
      const comments = (a.Comments ?? "").toLowerCase();
      const sameOrder = comments.includes(orderNumber.toLowerCase());
      const sameQty = Math.abs(Number(a.Quantity ?? 0) - qty) < 0.0001;
      return sameOrder && sameQty;
    });
    return match ?? null;
  } catch {
    return null;
  }
}

async function fetchAssembly(
  assemblyIdOrNumber: string,
  assemblyNumber?: string | null,
): Promise<UnleashedAssembly | null> {
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    assemblyIdOrNumber,
  );
  if (isGuid) {
    try {
      const res = await ulFetchRaw<UnleashedAssembly>(`/Assemblies/${assemblyIdOrNumber}`, "");
      if ((res as unknown as UnleashedAssembly).Guid || (res as unknown as UnleashedAssembly).AssemblyLines) {
        return res as unknown as UnleashedAssembly;
      }
      if (res.Items && res.Items.length > 0) return res.Items[0];
    } catch (e) {
      console.warn("[fill-ready] fetchAssembly by GUID failed", e);
    }
  }
  // Fallback: look up by AssemblyNumber via list endpoint
  const number = assemblyNumber || (!isGuid ? assemblyIdOrNumber : undefined);
  if (number) {
    try {
      const items = await ulFetchAllQueryPages<UnleashedAssembly>(
        "/Assemblies",
        [["assemblyNumber", number], ["pageSize", "50"]],
        2,
      );
      const match =
        items.find((a) => (a.AssemblyNumber ?? "").toLowerCase() === number.toLowerCase()) ??
        items[0];
      if (match?.Guid) {
        try {
          const full = await ulFetchRaw<UnleashedAssembly>(`/Assemblies/${match.Guid}`, "");
          if ((full as unknown as UnleashedAssembly).AssemblyLines) {
            return full as unknown as UnleashedAssembly;
          }
        } catch (e) {
          console.warn("[fill-ready] fetchAssembly detail by GUID after lookup failed", e);
        }
        return match;
      }
      return match ?? null;
    } catch (e) {
      console.warn("[fill-ready] fetchAssembly by number failed", e);
    }
  }
  return null;
}

export async function refreshJobAssemblyComponentsImpl(supabase: SupabaseLike, jobId: string) {
  const { data: row, error } = await supabase
    .from("production_jobs")
    .select("id, unleashed_assembly_id, unleashed_assembly_number, unleashed_sales_order_number, data")
    .eq("id", jobId)
    .single();
  if (error || !row) return { ok: false as const, error: error?.message ?? "Job not found" };
  if (!row.unleashed_assembly_id) return { ok: false as const, error: "Job has no linked Assembly" };

  const detail = await fetchAssembly(String(row.unleashed_assembly_id), row.unleashed_assembly_number);
  if (!detail) return { ok: false as const, error: "Could not read linked Assembly" };

  const components = mapAssemblyComponents(detail.AssemblyLines);
  const existing = (row.data ?? {}) as Record<string, unknown>;
  const merged = {
    ...existing,
    assemblyComponents: components,
    assemblyStatus: detail.AssemblyStatus ?? (existing.assemblyStatus as string | undefined) ?? null,
    assemblyCreatedAt: normaliseUnleashedDate(detail.AssemblyDate) ?? (existing.assemblyCreatedAt as string | undefined) ?? null,
    unleashedAssemblyNumber: detail.AssemblyNumber ?? row.unleashed_assembly_number ?? (existing.unleashedAssemblyNumber as string | undefined),
    unleashedSalesOrderNumber: row.unleashed_sales_order_number ?? (existing.unleashedSalesOrderNumber as string | undefined),
  };

  const { error: updateError } = await supabase.from("production_jobs").update({ data: merged }).eq("id", jobId);
  if (updateError) return { ok: false as const, error: updateError.message };
  return {
    ok: true as const,
    assemblyComponents: components,
    assemblyStatus: merged.assemblyStatus,
    assemblyCreatedAt: merged.assemblyCreatedAt,
    unleashedAssemblyNumber: merged.unleashedAssemblyNumber,
    unleashedSalesOrderNumber: merged.unleashedSalesOrderNumber,
  };
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
