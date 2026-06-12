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
 * Signed Unleashed GET. The string used to sign MUST equal the request's
 * query string (without the leading `?`). Pass `query` already serialized
 * exactly as it will appear in the URL.
 */
async function signedFetchRaw<T>(
  path: string,
  query: string,
): Promise<UnleashedListResponse<T>> {
  const apiId = process.env.UNLEASHED_API_ID;
  const apiKey = process.env.UNLEASHED_API_KEY;
  if (!apiId || !apiKey) {
    throw new Error("Unleashed credentials are not configured");
  }

  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", apiKey).update(query).digest("base64");

  const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
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

/**
 * Page through every Unleashed result page for `basePath` + `baseQuery`.
 * Unleashed paginates with /Endpoint/{pageNumber} and a Pagination block in
 * the response body.
 */
async function signedFetchAllPages<T>(
  basePath: string,
  baseParams: URLSearchParams,
): Promise<T[]> {
  const all: T[] = [];
  const MAX_PAGES = 50;
  let page = 1;
  while (page <= MAX_PAGES) {
    const params = new URLSearchParams(baseParams);
    // Unleashed re-canonicalizes the query server-side using %20 for spaces.
    // URLSearchParams encodes spaces as `+`, which produces a different
    // signature and a 403. Normalize to %20 so signed string == sent string
    // == what Unleashed re-signs.
    const query = params.toString().replace(/\+/g, "%20");
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
      const params = new URLSearchParams({
        pageSize: String(pageSize),
        productGroup: group,
      });
      const items = await signedFetchAllPages<UnleashedProduct>("/Products", params);
      for (const p of items) {
        if (!byCode.has(p.ProductCode)) byCode.set(p.ProductCode, p);
      }
    }
    return Array.from(byCode.values());
  });

export const unleashedFetchStockOnHand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { warehouseCode?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ pageSize: "200" });
    if (data.warehouseCode) params.set("warehouseCode", data.warehouseCode);
    return signedFetchAllPages<UnleashedStockOnHand>("/StockOnHand", params);
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
