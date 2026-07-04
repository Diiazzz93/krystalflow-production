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
  // Unleashed /BillOfMaterials returns each line as { Product, Quantity, ... }
  // (NOT ComponentProduct/ComponentQuantity — those exist on Assemblies).
  Product?: { Guid?: string; ProductCode?: string } | null;
  Quantity?: number;
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

  // 2) Pre-load existing imported SO ids. Completed jobs are ignored so a Sales
  //    Order that comes back as Fill Ready can be imported as a fresh active run
  //    while the previous completed run stays in local history.
  const existingIds = new Set<string>();
  {
    const { data, error } = await supabase
      .from("production_jobs")
      .select("id, unleashed_sales_order_id, status");
    if (!error && data) {
      for (const row of data as Array<{ id: string; unleashed_sales_order_id: string | null; status: string | null }>) {
        if (!row.unleashed_sales_order_id) continue;
        const soId = String(row.unleashed_sales_order_id);
        if ((row.status ?? "").toLowerCase() !== "complete") {
          existingIds.add(soId);
        }
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

      // 4) Build component blueprint from the BOM.
      //    KrystalFlow no longer creates an Assembly at import time — Assemblies
      //    are created per-pallet only after QC approval. This preserves the
      //    master Sales Order in Unleashed as the source reference.
      const assemblyComponents: Array<{
        productCode: string;
        productGuid?: string;
        name: string;
        quantity: number;
        unit?: string;
      }> = bomLines
        .map((line: UnleashedBomLine) => ({
          productCode: line.Product?.ProductCode ?? "",
          productGuid: line.Product?.Guid,
          name: line.Product?.ProductCode ?? "",
          quantity: Number(line.Quantity ?? 0) * qty,
        }))
        .filter((c: { productCode: string }) => c.productCode);





      // 5) Create the production job.
      const scheduledStart = normaliseUnleashedDate(so.OrderDate) ?? new Date().toISOString();
      const dueDate = normaliseUnleashedDate(so.RequiredDate ?? so.DueDate) ?? scheduledStart;

      const importedAt = new Date().toISOString();
      const jobPayload = {
        customer: so.Customer?.CustomerName ?? "Unknown",
        product: productDesc,
        sku: productCode,
        status: "Scheduled",
        operator: "",
        line: "",
        scheduled_start: scheduledStart,
        unleashed_sales_order_id: so.Guid,
        unleashed_sales_order_number: so.OrderNumber,
        unleashed_assembly_id: null,
        unleashed_assembly_number: null,
        imported_from_unleashed_at: importedAt,
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
          importedFromUnleashedAt: importedAt,
          unleashedSalesOrderNumber: so.OrderNumber,
          assemblyComponents,
          originalQuantity: bottleCount,
          originalPallets: 1,
          completedQuantity: 0,
          completedPallets: 0,
        },
      };

      const { data: jobRows, error: insertError } = await supabase
        .from("production_jobs")
        .insert(jobPayload)
        .select("id")
        .single();
      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);
      const jobId = jobRows?.id;
      const outcomeMessage = "Job created (Assemblies are created per-pallet on QC approval)";

      summary.imported++;
      summary.details.push({
        salesOrderNumber: so.OrderNumber,
        outcome: "imported",
        message: outcomeMessage,
      });
      await supabase.from("unleashed_sync_log").insert({
        sales_order_id: so.Guid,
        sales_order_number: so.OrderNumber,
        outcome: "imported",
        message: outcomeMessage,
        job_id: jobId,
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
        const { assembly: detail } = await fetchAssembly(row.unleashed_assembly_id, row.unleashed_assembly_number);
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

export async function fetchBom(productGuid: string): Promise<UnleashedBom | null> {
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

/**
 * Pull the product's Bill of Materials from Unleashed and store the scaled
 * component list on the job. Used to surface stock requirements BEFORE the
 * per-pallet Assembly is created on QC approval.
 */
export async function refreshJobBomComponentsImpl(supabase: SupabaseLike, jobId: string) {
  const { data: row, error } = await supabase
    .from("production_jobs")
    .select("id, sku, product, data")
    .eq("id", jobId)
    .single();
  if (error || !row) return { ok: false as const, error: error?.message ?? "Job not found" };

  const existing = (row.data ?? {}) as Record<string, unknown>;
  const productCode = String(row.sku ?? existing.sku ?? "");
  if (!productCode) return { ok: false as const, error: "Job has no SKU" };

  interface UlProduct { Guid?: string; ProductCode?: string; ProductDescription?: string }
  let productGuid: string | undefined;
  let productDesc = String(row.product ?? existing.product ?? productCode);
  try {
    const resp = await ulFetchRaw<UlProduct>("/Products", `productCode=${productCode}&pageSize=1`);
    productGuid = resp.Items?.[0]?.Guid;
    if (resp.Items?.[0]?.ProductDescription) productDesc = resp.Items[0].ProductDescription;
  } catch (e) {
    return { ok: false as const, error: `Product lookup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!productGuid) return { ok: false as const, error: `Unleashed product not found for SKU ${productCode}` };

  const bom = await fetchBom(productGuid);
  const bomLines = bom?.BillOfMaterialsLines ?? bom?.BillOfMaterialLines ?? [];
  if (!bom || bomLines.length === 0) {
    return { ok: false as const, error: `No Bill of Materials found for product ${productCode}` };
  }

  // Scale by the job's carton quantity (same math as the SO importer).
  const pack = parseProductPackaging(productDesc);
  const bottlesPerCarton = (existing.bottlesPerCarton as number | undefined) ?? pack.bottlesPerCarton;
  const isBoxedProduct = (bottlesPerCarton ?? 1) > 1;
  const cartonsOrdered =
    (existing.cartonsOrdered as number | undefined) ??
    (isBoxedProduct && typeof existing.quantity === "number" && bottlesPerCarton
      ? Math.ceil((existing.quantity as number) / bottlesPerCarton)
      : (existing.quantity as number | undefined));
  const qty = Number(cartonsOrdered ?? 0);
  if (!qty || qty <= 0) return { ok: false as const, error: "Job has no usable quantity for BOM scaling" };

  const components = bomLines
    .map((line) => ({
      productCode: line.Product?.ProductCode ?? "",
      productGuid: line.Product?.Guid,
      name: line.Product?.ProductCode ?? "",
      quantity: Number(line.Quantity ?? 0) * qty,
    }))
    .filter((c) => c.productCode);

  if (components.length === 0) {
    return {
      ok: false as const,
      error: `BOM for ${productCode} returned ${bomLines.length} line(s) but no usable components could be parsed`,
    };
  }

  const merged: Record<string, unknown> = {
    ...existing,
    assemblyComponents: components,
    bomSource: "bill-of-materials",
    bomRefreshedAt: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from("production_jobs")
    .update({ data: merged })
    .eq("id", jobId);
  if (updateError) return { ok: false as const, error: updateError.message };

  return {
    ok: true as const,
    source: "bom" as const,
    assemblyComponents: components,
    cartonsOrdered: isBoxedProduct ? qty : undefined,
    bottlesPerCarton: isBoxedProduct ? bottlesPerCarton : undefined,
  };
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
): Promise<{ assembly: UnleashedAssembly | null; errors: string[] }> {
  const errors: string[] = [];
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    assemblyIdOrNumber,
  );
  if (isGuid) {
    try {
      const res = await ulFetchRaw<UnleashedAssembly>(`/Assemblies/${assemblyIdOrNumber}`, "");
      if ((res as unknown as UnleashedAssembly).Guid || (res as unknown as UnleashedAssembly).AssemblyLines) {
        return { assembly: res as unknown as UnleashedAssembly, errors };
      }
      if (res.Items && res.Items.length > 0) return { assembly: res.Items[0], errors };
    } catch (e) {
      errors.push(`GUID lookup: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const number = assemblyNumber || (!isGuid ? assemblyIdOrNumber : undefined);
  if (number) {
    // Try filtered list lookup by AssemblyNumber
    try {
      const items = await ulFetchAllQueryPages<UnleashedAssembly>(
        "/Assemblies",
        [["assemblyNumber", number], ["pageSize", "50"]],
        2,
      );
      const match = items.find((a) => (a.AssemblyNumber ?? "").toLowerCase() === number.toLowerCase());
      if (match?.Guid) {
        try {
          const full = await ulFetchRaw<UnleashedAssembly>(`/Assemblies/${match.Guid}`, "");
          if ((full as unknown as UnleashedAssembly).AssemblyLines) {
            return { assembly: full as unknown as UnleashedAssembly, errors };
          }
        } catch (e) {
          errors.push(`Detail GUID after number: ${e instanceof Error ? e.message : String(e)}`);
        }
        return { assembly: match, errors };
      }
      if (match) return { assembly: match, errors };
    } catch (e) {
      errors.push(`Number lookup: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Final fallback: scan recent assemblies and match by number
    try {
      const items = await ulFetchAllQueryPages<UnleashedAssembly>(
        "/Assemblies",
        [["pageSize", "200"]],
        5,
      );
      const match = items.find((a) => (a.AssemblyNumber ?? "").toLowerCase() === number.toLowerCase());
      if (match?.Guid) {
        try {
          const full = await ulFetchRaw<UnleashedAssembly>(`/Assemblies/${match.Guid}`, "");
          if ((full as unknown as UnleashedAssembly).AssemblyLines) {
            return { assembly: full as unknown as UnleashedAssembly, errors };
          }
        } catch (e) {
          errors.push(`Detail GUID after scan: ${e instanceof Error ? e.message : String(e)}`);
        }
        return { assembly: match, errors };
      }
      errors.push(`Scan of ${items.length} recent assemblies did not contain ${number}`);
    } catch (e) {
      errors.push(`Scan lookup: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push(`No assembly number available; stored id "${assemblyIdOrNumber}" is not a GUID`);
  }
  return { assembly: null, errors };
}

async function fetchSalesOrderForJob(row: Record<string, unknown>) {
  const errors: string[] = [];
  const id = typeof row.unleashed_sales_order_id === "string" ? row.unleashed_sales_order_id : null;
  const number = typeof row.unleashed_sales_order_number === "string" ? row.unleashed_sales_order_number : null;
  if (id) {
    try {
      const res = await ulFetchRaw<UnleashedSalesOrder>(`/SalesOrders/${id}`, "");
      if ((res as unknown as UnleashedSalesOrder).Guid) return { salesOrder: res as unknown as UnleashedSalesOrder, errors };
    } catch (e) {
      errors.push(`Sales Order GUID lookup: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (number) {
    try {
      const items = await ulFetchAllQueryPages<UnleashedSalesOrder>("/SalesOrders", [["orderNumber", number], ["pageSize", "50"]], 2);
      const match = items.find((so) => (so.OrderNumber ?? "").toLowerCase() === number.toLowerCase());
      if (match?.Guid) {
        const detail = await ulFetchRaw<UnleashedSalesOrder>(`/SalesOrders/${match.Guid}`, "");
        return { salesOrder: (detail as unknown as UnleashedSalesOrder).Guid ? detail as unknown as UnleashedSalesOrder : match, errors };
      }
    } catch (e) {
      errors.push(`Sales Order number lookup: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { salesOrder: null, errors };
}

async function rebuildAssemblyFromSalesOrder(row: Record<string, unknown>): Promise<{
  assembly: UnleashedAssembly | null;
  jobData: Record<string, unknown>;
  errors: string[];
}> {
  const errors: string[] = [];
  const { salesOrder, errors: soErrors } = await fetchSalesOrderForJob(row);
  errors.push(...soErrors);
  if (!salesOrder) return { assembly: null, jobData: {}, errors: [...errors, "Could not reload Sales Order to rebuild Assembly"] };

  const sku = typeof row.sku === "string" ? row.sku : undefined;
  const lines = (salesOrder.SalesOrderLines ?? []).filter((l) => l.Product?.Guid);
  const primary = lines.find((l) => l.Product?.ProductCode === sku) ?? lines.sort((a, b) => (b.OrderQuantity ?? 0) - (a.OrderQuantity ?? 0))[0];
  if (!primary?.Product?.Guid) return { assembly: null, jobData: {}, errors: [...errors, "Sales Order has no product line to rebuild Assembly"] };

  const productGuid = primary.Product.Guid;
  const productCode = primary.Product.ProductCode ?? sku ?? "";
  const productDesc = primary.Product.ProductDescription ?? String(row.product ?? productCode);
  const qty = Number(primary.OrderQuantity ?? 0);
  const pack = parseProductPackaging(productDesc);
  const bottlesPerCarton = pack.bottlesPerCarton;
  const isBoxedProduct = bottlesPerCarton > 1;
  const bottleCount = isBoxedProduct ? qty * bottlesPerCarton : qty;
  const bottleSize = pack.bottleSize ?? "";

  const existing = await findExistingAssembly(productCode, qty, salesOrder.OrderNumber);
  let assembly = existing;
  if (!assembly?.Guid) {
    try {
      assembly = await ulPost<UnleashedAssembly>("/Assemblies", {
        Quantity: qty,
        Product: { Guid: productGuid },
        SourceWarehouse: salesOrder.Warehouse?.WarehouseCode ? { WarehouseCode: salesOrder.Warehouse.WarehouseCode } : undefined,
        DestinationWarehouse: salesOrder.Warehouse?.WarehouseCode ? { WarehouseCode: salesOrder.Warehouse.WarehouseCode } : undefined,
        Comments: `Auto-created by KrystalFlow from Sales Order ${salesOrder.OrderNumber}`,
      });
    } catch (e) {
      errors.push(`Assembly rebuild create: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (assembly?.Guid) {
    const full = await fetchAssembly(assembly.Guid, assembly.AssemblyNumber ?? null);
    errors.push(...full.errors);
    assembly = full.assembly ?? assembly;
  }

  return {
    assembly: assembly ?? null,
    jobData: {
      customer: salesOrder.Customer?.CustomerName ?? row.customer,
      product: productDesc,
      sku: productCode,
      bottleSize,
      quantity: bottleCount,
      bottlesPerCarton: isBoxedProduct ? bottlesPerCarton : undefined,
      cartonsOrdered: isBoxedProduct ? qty : undefined,
      dueDate: (normaliseUnleashedDate(salesOrder.RequiredDate ?? salesOrder.DueDate) ?? new Date().toISOString()).slice(0, 10),
      unleashedSalesOrderNumber: salesOrder.OrderNumber,
    },
    errors,
  };
}

export async function refreshJobAssemblyComponentsImpl(supabase: SupabaseLike, jobId: string) {
  const { data: row, error } = await supabase
    .from("production_jobs")
    .select("id, sku, product, unleashed_sales_order_id, unleashed_assembly_id, unleashed_assembly_number, unleashed_sales_order_number, data")
    .eq("id", jobId)
    .single();
  if (error || !row) return { ok: false as const, error: error?.message ?? "Job not found" };

  const lookupErrors: string[] = [];
  let detail: UnleashedAssembly | null = null;
  let relinked = false;

  if (row.unleashed_assembly_id) {
    const res = await fetchAssembly(
      String(row.unleashed_assembly_id),
      row.unleashed_assembly_number,
    );
    detail = res.assembly;
    lookupErrors.push(...res.errors);
  }

  // Self-heal: if the linked Assembly is gone (e.g. deleted in Unleashed),
  // search for an Assembly that belongs to this Sales Order and re-link.
  if (!detail && row.unleashed_sales_order_number) {
    const soNumber = String(row.unleashed_sales_order_number).toLowerCase();
    const existingData = (row.data ?? {}) as Record<string, unknown>;
    const productCode =
      typeof existingData.productCode === "string"
        ? existingData.productCode
        : typeof existingData.sku === "string"
          ? existingData.sku
          : typeof row.sku === "string"
            ? row.sku
            : null;
    try {
      const scanned = productCode
        ? await ulFetchAllQueryPages<UnleashedAssembly>("/Assemblies", [["productCode", productCode], ["pageSize", "200"]], 3)
        : await ulFetchAllQueryPages<UnleashedAssembly>("/Assemblies", [["pageSize", "200"]], 5);
      const candidates = scanned.filter((a) => (a.Comments ?? "").toLowerCase().includes(soNumber));
      // Prefer the most recent (highest AssemblyNumber lexicographically works for ASM-#### sequence)
      candidates.sort((a, b) => (b.AssemblyNumber ?? "").localeCompare(a.AssemblyNumber ?? ""));
      const candidate = candidates[0];
      if (candidate?.Guid) {
        const full = await fetchAssembly(candidate.Guid, candidate.AssemblyNumber ?? null);
        detail = full.assembly ?? candidate;
        lookupErrors.push(...full.errors);
        relinked = true;
      } else if (candidates.length === 0) {
        lookupErrors.push(`No Assembly in Unleashed references Sales Order ${row.unleashed_sales_order_number}`);
      }
    } catch (e) {
      lookupErrors.push(`SO re-link scan: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Last resort: rebuild the missing link from the Sales Order itself. This
  // covers the real-world case where the wrong Assembly was linked, imported,
  // then deleted before KrystalFlow could pull the component lines.
  let rebuiltJobData: Record<string, unknown> = {};
  if (!detail) {
    const rebuilt = await rebuildAssemblyFromSalesOrder(row as Record<string, unknown>);
    lookupErrors.push(...rebuilt.errors);
    detail = rebuilt.assembly;
    rebuiltJobData = rebuilt.jobData;
    if (detail) relinked = true;
  }

  if (!detail) {
    const base = row.unleashed_assembly_id ? "Could not read linked Assembly" : "Job has no linked Assembly";
    const detailMsg = lookupErrors.length ? ` (${lookupErrors.join("; ")})` : "";
    return { ok: false as const, error: `${base}${detailMsg}` };
  }

  const components = mapAssemblyComponents(detail.AssemblyLines);
  const existing = (row.data ?? {}) as Record<string, unknown>;
  const newAssemblyNumber = detail.AssemblyNumber ?? row.unleashed_assembly_number ?? (existing.unleashedAssemblyNumber as string | undefined);
  const merged: Record<string, unknown> = {
    ...existing,
    ...rebuiltJobData,
    assemblyComponents: components,
    assemblyStatus: detail.AssemblyStatus ?? (existing.assemblyStatus as string | undefined) ?? null,
    assemblyCreatedAt: normaliseUnleashedDate(detail.AssemblyDate) ?? (existing.assemblyCreatedAt as string | undefined) ?? null,
    unleashedAssemblyNumber: newAssemblyNumber,
    unleashedSalesOrderNumber: row.unleashed_sales_order_number ?? (existing.unleashedSalesOrderNumber as string | undefined),
  };

  const updatePayload: Record<string, unknown> = { data: merged };
  if (typeof rebuiltJobData.product === "string") updatePayload.product = rebuiltJobData.product;
  if (typeof rebuiltJobData.sku === "string") updatePayload.sku = rebuiltJobData.sku;
  if (relinked && detail.Guid) {
    updatePayload.unleashed_assembly_id = detail.Guid;
    updatePayload.unleashed_assembly_number = detail.AssemblyNumber ?? row.unleashed_assembly_number ?? null;
  }

  const { error: updateError } = await supabase.from("production_jobs").update(updatePayload).eq("id", jobId);
  if (updateError) return { ok: false as const, error: updateError.message };
  const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  const stringValue = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    ok: true as const,
    relinked,
    assemblyComponents: components,
    assemblyStatus: stringValue(merged.assemblyStatus) ?? null,
    assemblyCreatedAt: stringValue(merged.assemblyCreatedAt) ?? null,
    unleashedAssemblyNumber: stringValue(merged.unleashedAssemblyNumber) ?? null,
    unleashedSalesOrderNumber: stringValue(merged.unleashedSalesOrderNumber) ?? null,
    quantity: numberValue(merged.quantity),
    cartonsOrdered: numberValue(merged.cartonsOrdered),
    bottlesPerCarton: numberValue(merged.bottlesPerCarton),
    bottleSize: stringValue(merged.bottleSize),
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
