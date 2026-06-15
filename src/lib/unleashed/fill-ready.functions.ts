// Authenticated server functions exposed to the React app for the Fill
// Ready workflow. Real work lives in `fill-ready.server.ts`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runFillReadyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only admin/manager can trigger imports — they're the ones who'll see
    // the resulting jobs and approve assemblies.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isManager } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "manager",
    });
    if (!isAdmin && !isManager) {
      throw new Error("Only admins and managers can sync Unleashed sales orders");
    }
    const { importFillReadyImpl } = await import("./fill-ready.server");
    return importFillReadyImpl(context.supabase as any);
  });

export const completeAssembly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("jobId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isManager } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "manager",
    });
    if (!isAdmin && !isManager) {
      throw new Error("Only admins and managers can approve assemblies");
    }
    const { completeAssemblyImpl } = await import("./fill-ready.server");
    const result = await completeAssemblyImpl(context.supabase as any, data.jobId, context.userId);
    if (!result.ok) throw new Error(result.error);
    return { ok: true };
  });
