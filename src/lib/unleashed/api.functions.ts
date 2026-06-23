// Server-side Unleashed API client.
//
// Signs requests with HMAC-SHA256 per
// https://apidocs.unleashedsoftware.com/AuthenticationHelp and returns
// the raw `Items` arrays in the same shapes the rest of the app uses.
//
// Credentials (`UNLEASHED_API_ID`, `UNLEASHED_API_KEY`) live in Lovable
// Cloud secrets and are only read inside `.handler()` bodies so they
// never reach the browser bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  UnleashedProduct,
  UnleashedProductGroup,
  UnleashedStockOnHand,
  UnleashedWarehouse,
} from "./types";

const BASE_URL = "https://api.unleashedsoftware.com";

interface UnleashedListResponse<T> {
  Items?: T[];
  Pagination?: {
    NumberOfItems?: number;
    PageSize?: number;
    PageNumber?: number;
    NumberOfPages?: number;
  };
}

/**
 * Signed Unleashed GET.
 *
 * Unleashed signs the **decoded** query string (e.g. `productGroup=Recochem Bottles`)
 * even though the request sends the URL-encoded form. Pass the decoded query;
 * we URL-encode it for the request line.
 */
async function signedFetchRaw<T>(
  path: string,
  decodedQuery: string,
): Promise<UnleashedListResponse<T>> {
  const apiId = process.env.UNLEASHED_API_ID;
  const apiKey = process.env.UNLEASHED_API_KEY;
  if (!apiId || !apiKey) {
    throw new Error("Unleashed credentials are not configured");
  }

  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", apiKey).update(decodedQuery).digest("base64");

  // Re-encode each value for the actual request URL.
  const encodedQuery = decodedQuery
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return encodeURIComponent(pair);
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1);
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join("&");

  const url = `${BASE_URL}${path}${encodedQuery ? `?${encodedQuery}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-auth-id": apiId,
      "api-auth-signature": signature,
      "client-type": "krystalflow/1.0",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Unleashed ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }

  return (await res.json()) as UnleashedListResponse<T>;
}

async function signedFetch<T>(path: string, query: string): Promise<T[]> {
  const json = await signedFetchRaw<T>(path, query);
  return json.Items ?? [];
}

/** Build a decoded querystring (k=v&k=v) from entries. */
function buildDecodedQuery(entries: Array<[string, string]>): string {
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Page through every Unleashed result page for `basePath`.
 * Unleashed paginates with `/Endpoint/{pageNumber}` and a Pagination block
 * in the response body.
 */
async function signedFetchAllPages<T>(
  basePath: string,
  baseEntries: Array<[string, string]>,
): Promise<T[]> {
  const all: T[] = [];
  const MAX_PAGES = 50;
  let page = 1;
  const query = buildDecodedQuery(baseEntries);
  while (page <= MAX_PAGES) {
    const json = await signedFetchRaw<T>(`${basePath}/${page}`, query);
    const items = json.Items ?? [];
    all.push(...items);
    const totalPages = json.Pagination?.NumberOfPages ?? 1;
    if (page >= totalPages || items.length === 0) break;
    page++;
  }
  return all;
}

export const unleashedFetchWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return signedFetch<UnleashedWarehouse>("/Warehouses", "");
  });

export const unleashedFetchProductGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return signedFetch<UnleashedProductGroup>("/ProductGroups", "");
  });

/**
 * Fetch products across selected product groups, with pagination.
 * - No groups passed → returns nothing (we don't want to silently flood
 *   the app — user must pick groups first).
 * - One or more groups → one paginated call per group, results merged
 *   and deduplicated by ProductCode.
 *
 * Unleashed's `productGroup` filter matches the parent group only and
 * does NOT recurse into sub-groups (per Unleashed docs), so callers that
 * need sub-groups must pass them explicitly.
 */
export const unleashedFetchProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { groupNames?: string[]; pageSize?: number } | undefined) => input ?? {},
  )
  .handler(async ({ data }) => {
    const pageSize = Math.min(Math.max(data.pageSize ?? 200, 50), 500);
    const groups = (data.groupNames ?? []).map((g) => g.trim()).filter(Boolean);

    if (groups.length === 0) {
      return [] as UnleashedProduct[];
    }

    const byCode = new Map<string, UnleashedProduct>();
    for (const group of groups) {
      const entries: Array<[string, string]> = [
        ["pageSize", String(pageSize)],
        ["productGroup", group],
      ];
      const items = await signedFetchAllPages<UnleashedProduct>("/Products", entries);
      const matchingItems = items.filter((p) => p.ProductGroup?.GroupName?.trim() === group);
      for (const p of matchingItems) {
        if (!byCode.has(p.ProductCode)) byCode.set(p.ProductCode, p);
      }
    }
    return Array.from(byCode.values());
  });

export const unleashedFetchStockOnHand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { warehouseCode?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const entries: Array<[string, string]> = [["pageSize", "200"]];
    if (data.warehouseCode) entries.push(["warehouseCode", data.warehouseCode]);

    // Unleashed's StockOnHand endpoint ignores `pageNumber` as a query string
    // and always returns page 1. Page through with `/StockOnHand/{page}` or
    // products after the first 200 rows never update in the app.
    const rows = await signedFetchAllPages<
      Omit<UnleashedStockOnHand, "Warehouse" | "MinStockAlertLevel"> & {
        Warehouse?: string | { WarehouseCode?: string; WarehouseName?: string } | null;
        WarehouseCode?: string | null;
        MinStockAlertLevel?: number | null;
      }
    >("/StockOnHand", entries);

    return rows.map((row) => {
      const warehouse =
        typeof row.Warehouse === "string"
          ? { WarehouseCode: row.WarehouseCode ?? "", WarehouseName: row.Warehouse }
          : {
              WarehouseCode: row.Warehouse?.WarehouseCode ?? row.WarehouseCode ?? "",
              WarehouseName: row.Warehouse?.WarehouseName ?? "",
            };

      return {
        ...row,
        Warehouse: warehouse,
        MinStockAlertLevel: Number(row.MinStockAlertLevel ?? 0),
      } satisfies UnleashedStockOnHand;
    });
  });

export const unleashedPing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const apiId = process.env.UNLEASHED_API_ID;
    const apiKey = process.env.UNLEASHED_API_KEY;
    if (!apiId || !apiKey) {
      return {
        ok: false as const,
        error: "Credentials not configured (UNLEASHED_API_ID / UNLEASHED_API_KEY)",
      };
    }

    const path = "/Warehouses";
    const query = "";
    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
    const { createHmac } = await import("crypto");
    const signature = createHmac("sha256", apiKey).update(query).digest("base64");

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "api-auth-id": apiId,
          "api-auth-signature": signature,
          "client-type": "krystalflow/1.0",
        },
      });
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) {
        return {
          ok: false as const,
          status: res.status,
          url,
          stringToSign: query,
          apiIdPreview: `${apiId.slice(0, 4)}…${apiId.slice(-4)} (len ${apiId.length})`,
          body: bodyText.slice(0, 500),
          error: `Unleashed ${path} returned ${res.status} ${res.statusText}`,
        };
      }
      let warehouses = 0;
      try {
        const json = JSON.parse(bodyText) as { Items?: unknown[] };
        warehouses = json.Items?.length ?? 0;
      } catch {
        /* ignore */
      }
      return { ok: true as const, status: res.status, url, warehouses };
    } catch (e) {
      return {
        ok: false as const,
        url,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
