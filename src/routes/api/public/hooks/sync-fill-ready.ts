// Cron-triggered Fill Ready import.
//
// Authentication is a dedicated server secret, not the Supabase publishable
// key. That publishable key is shipped to every browser, so it cannot prove
// the caller is the cron job.
//
// Required header:
//   x-sync-webhook-secret: <SYNC_WEBHOOK_SECRET>
//
// SYNC_WEBHOOK_SECRET is a server environment variable. If it is missing,
// this route rejects every request.
//
// Set the same value in both places:
//
// 1. The app host (Cloudflare / Lovable), so this route can read it.
//    - Cloudflare: Workers & Pages → this worker → Settings → Variables and
//      Secrets → Add → Secret, name SYNC_WEBHOOK_SECRET.
//      Or from a shell: npx wrangler secret put SYNC_WEBHOOK_SECRET
//    - Lovable Cloud: Project → Secrets / environment variables, same name.
//      Lovable passes server env vars through to the Cloudflare worker.
//    Do not prefix it with VITE_. Do not commit the value.
//
// 2. Whatever calls this URL (the existing Supabase pg_cron job, via pg_net,
//    or a Database Webhook). Send the header above and stop sending the
//    publishable key in `apikey` or `x-api-key`.
//    Keep the secret out of SQL source by storing it in Supabase Vault
//    (Dashboard → Project Settings → Vault, or the vault schema) and reading
//    it inside the cron command, for example:
//      headers := jsonb_build_object(
//        'Content-Type', 'application/json',
//        'x-sync-webhook-secret', (
//          select decrypted_secret
//          from vault.decrypted_secrets
//          where name = 'sync_webhook_secret'
//        )
//      )
//    Update the existing job in place (Dashboard → Integrations → Cron, or
//    cron.job in the SQL editor). Do not add a second schedule.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-fill-ready")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-sync-webhook-secret") ?? "";
        const expected = process.env.SYNC_WEBHOOK_SECRET ?? "";
        const { secretsMatch } = await import("@/lib/webhook-secret.server");
        if (!(await secretsMatch(provided, expected))) {
          if (!expected) {
            console.error(
              "[sync-fill-ready] SYNC_WEBHOOK_SECRET is not set; rejecting the webhook",
            );
          }
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { importFillReadyImpl } = await import("@/lib/unleashed/fill-ready.server");
        try {
          // SupabaseLike is a small duck type; the generated client is a different shape.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const summary = await importFillReadyImpl(supabaseAdmin as any);
          return Response.json({ ok: true, summary });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
