import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Copies SYNC_WEBHOOK_SECRET into Supabase Vault under the name
// sync_webhook_secret. The 5-minute job sends that key only if its SQL
// already reads the vault value into the x-sync-webhook-secret header.
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
    if (!secret) {
      throw new Error(
        "The security key is not on the published app yet. In Lovable, add a secret named SYNC_WEBHOOK_SECRET, publish again, then press the button.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: rpcErr } = await supabaseAdmin.rpc("set_sync_webhook_secret", {
      p_secret: secret,
    });
    if (rpcErr) {
      throw new Error(`The database could not store the security key. ${rpcErr.message}`);
    }
    return { ok: true };
  });
