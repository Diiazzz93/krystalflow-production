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
  UnleashedStockOnHand,
  UnleashedWarehouse,
} from "./types";

const BASE_URL = "https://api.unleashedsoftware.com";

async function signedFetch<T>(path: string, query: string): Promise<T[]> {
  const apiId = process.env.UNLEASHED_API_ID;
  const apiKey = process.env.UNLEASHED_API_KEY;
  if (!apiId || !apiKey) {
    throw new Error("Unleashed credentials are not configured");
  }

  // Per Unleashed docs: signature = base64(HMAC-SHA256(apiKey, queryString))
  // where queryString excludes the leading "?".
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

  const json = (await res.json()) as { Items?: T[] };
  return json.Items ?? [];
}

export const unleashedFetchWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return signedFetch<UnleashedWarehouse>("/Warehouses", "");
  });

export const unleashedFetchProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Page 1, large page size — fine for KrystalFlow's catalogue size.
    return signedFetch<UnleashedProduct>("/Products", "pageSize=500");
  });

export const unleashedFetchStockOnHand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { warehouseCode?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ pageSize: "500" });
    if (data.warehouseCode) params.set("warehouseCode", data.warehouseCode);
    return signedFetch<UnleashedStockOnHand>("/StockOnHand", params.toString());
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

    // Diagnostic call — bypasses signedFetch so we can return status + body
    // verbatim for debugging signature / endpoint issues.
    const path = "/Warehouses";
    const query = ""; // no query params → signature is HMAC of empty string
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
