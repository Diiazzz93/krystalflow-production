// Cron-triggered Fill Ready import endpoint.
// Callable from pg_cron with the Supabase publishable key in the `apikey`
// header — the same value the project already uses elsewhere. Anyone
// without that key gets 401.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-fill-ready")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ||
          request.headers.get("x-api-key") ||
          "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.SUPABASE_ANON_KEY ||
          "";
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { importFillReadyImpl } = await import("@/lib/unleashed/fill-ready.server");
        try {
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
