import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Copies SYNC_WEBHOOK_SECRET into the database vault so the scheduled
// sync-fill-ready job can send it in the x-sync-webhook-secret header.
export const linkSyncWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!roles?.some((r: { role: string }) => r.role === "admin")) {
      throw new Error("Only admins can do this");
    }
    const secret = process.env.SYNC_WEBHOOK_SECRET;
    if (!secret) throw new Error("SYNC_WEBHOOK_SECRET is not set");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: rpcErr } = await (supabaseAdmin.rpc as any)("set_sync_webhook_secret", {
      p_secret: secret,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true };
  });
