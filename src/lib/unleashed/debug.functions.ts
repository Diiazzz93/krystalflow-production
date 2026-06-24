import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE_URL = "https://api.unleashedsoftware.com";

export const unleashedDebugProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productCode: string }) => input)
  .handler(async ({ data }) => {
    const apiId = process.env.UNLEASHED_API_ID!;
    const apiKey = process.env.UNLEASHED_API_KEY!;
    const { createHmac } = await import("crypto");
    const query = `productCode=${data.productCode}`;
    const signature = createHmac("sha256", apiKey).update(query).digest("base64");
    const url = `${BASE_URL}/Products?productCode=${encodeURIComponent(data.productCode)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "api-auth-id": apiId,
        "api-auth-signature": signature,
        "client-type": "krystalflow/1.0",
      },
    });
    const json = (await res.json()) as { Items?: unknown[] };
    return json.Items?.[0] ?? null;
  });
