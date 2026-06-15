// Shared Unleashed signed-request helpers (server-only).
// Used by `*.functions.ts` handlers and by the cron route. Per Unleashed
// docs the HMAC is computed over the *decoded* query string only — the
// request body is not signed.

const BASE_URL = "https://api.unleashedsoftware.com";

function getCreds() {
  const apiId = process.env.UNLEASHED_API_ID;
  const apiKey = process.env.UNLEASHED_API_KEY;
  if (!apiId || !apiKey) throw new Error("Unleashed credentials are not configured");
  return { apiId, apiKey };
}

function encodeQuery(decoded: string) {
  return decoded
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return encodeURIComponent(pair);
      return `${encodeURIComponent(pair.slice(0, eq))}=${encodeURIComponent(pair.slice(eq + 1))}`;
    })
    .join("&");
}

async function sign(query: string, apiKey: string) {
  const { createHmac } = await import("crypto");
  return createHmac("sha256", apiKey).update(query).digest("base64");
}

interface ListResponse<T> {
  Items?: T[];
  Pagination?: { NumberOfPages?: number; PageNumber?: number };
}

export async function ulFetchRaw<T>(
  path: string,
  decodedQuery: string,
): Promise<ListResponse<T>> {
  const { apiId, apiKey } = getCreds();
  const signature = await sign(decodedQuery, apiKey);
  const url = `${BASE_URL}${path}${decodedQuery ? `?${encodeQuery(decodedQuery)}` : ""}`;
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
    throw new Error(`Unleashed GET ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return (await res.json()) as ListResponse<T>;
}

export async function ulFetchAllQueryPages<T>(
  path: string,
  baseEntries: Array<[string, string]>,
  maxPages = 100,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const entries: Array<[string, string]> = [...baseEntries, ["pageNumber", String(page)]];
    const query = entries.map(([k, v]) => `${k}=${v}`).join("&");
    const json = await ulFetchRaw<T>(path, query);
    const items = json.Items ?? [];
    all.push(...items);
    const totalPages = json.Pagination?.NumberOfPages ?? 1;
    if (page >= totalPages || items.length === 0) break;
  }
  return all;
}

export async function ulPost<T = unknown>(
  path: string,
  body: unknown,
  decodedQuery = "",
): Promise<T> {
  const { apiId, apiKey } = getCreds();
  const signature = await sign(decodedQuery, apiKey);
  const url = `${BASE_URL}${path}${decodedQuery ? `?${encodeQuery(decodedQuery)}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-auth-id": apiId,
      "api-auth-signature": signature,
      "client-type": "krystalflow/1.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Unleashed POST ${path} failed: ${res.status} ${txt.slice(0, 400)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export async function ulPut<T = unknown>(path: string, body: unknown): Promise<T> {
  const { apiId, apiKey } = getCreds();
  const signature = await sign("", apiKey);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-auth-id": apiId,
      "api-auth-signature": signature,
      "client-type": "krystalflow/1.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Unleashed PUT ${path} failed: ${res.status} ${txt.slice(0, 400)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}
