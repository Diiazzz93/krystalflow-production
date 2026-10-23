// Read-only feed of completed QC forms for an external assistant.
//
// GET /api/public/hooks/qc-feed?since=<ISO timestamp>&until=<optional ISO>
// Header: x-qc-feed-secret: <QC_FEED_SECRET>
//
// QC_FEED_SECRET is a server environment variable. If it is missing, this
// route returns 500. A missing or wrong header returns 401. The route never
// inserts, updates, or deletes.
//
// Setup and a curl example: docs/qc-feed.md
// Do not prefix the secret with VITE_. Do not commit the value.

import { createFileRoute } from "@tanstack/react-router";

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

const methodNotAllowed = () => jsonError("Method not allowed", 405);

export const Route = createFileRoute("/api/public/hooks/qc-feed")({
  server: {
    handlers: {
      POST: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      HEAD: methodNotAllowed,
      OPTIONS: methodNotAllowed,
      GET: async ({ request }) => {
        const expected = process.env.QC_FEED_SECRET ?? "";
        if (!expected) {
          console.error("[qc-feed] QC_FEED_SECRET is not set; rejecting the request");
          return jsonError("QC feed secret is not configured", 500);
        }

        const provided = request.headers.get("x-qc-feed-secret") ?? "";
        const { secretsMatch } = await import("@/lib/webhook-secret.server");
        if (!(await secretsMatch(provided, expected))) {
          return jsonError("Unauthorized", 401);
        }

        const url = new URL(request.url);
        const { parseIsoTimestamp, loadCompletedQcFeed, buildQcFeedResponse } =
          await import("@/lib/qc-feed.server");

        const since = parseIsoTimestamp(url.searchParams.get("since"));
        if (!since) {
          return jsonError("since is required and must be an ISO-8601 timestamp", 400);
        }

        const untilRaw = url.searchParams.get("until");
        const until =
          untilRaw == null || untilRaw.trim() === "" ? null : parseIsoTimestamp(untilRaw);
        if (untilRaw != null && untilRaw.trim() !== "" && !until) {
          return jsonError("until must be an ISO-8601 timestamp", 400);
        }
        if (until && Date.parse(until) < Date.parse(since)) {
          return jsonError("until must be on or after since", 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const items = await loadCompletedQcFeed(supabaseAdmin, { since, until });
          return Response.json(buildQcFeedResponse({ since, until, items }));
        } catch (e) {
          console.error("[qc-feed] read failed", e instanceof Error ? e.message : e);
          return jsonError("Could not load QC records", 500);
        }
      },
    },
  },
});
