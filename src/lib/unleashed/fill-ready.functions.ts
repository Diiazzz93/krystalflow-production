// Authenticated server functions exposed to the React app for the Fill
// Ready workflow. Real work lives in `fill-ready.server.ts`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdminOrManager(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  const roles = new Set((data ?? []).map((r: { role: string }) => r.role));
  if (!roles.has("admin") && !roles.has("manager")) {
    throw new Error("Only admins and managers can perform this action");
  }
}

export const runFillReadyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrManager(context.supabase, context.userId);
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
    await assertAdminOrManager(context.supabase, context.userId);
    const { completeAssemblyImpl } = await import("./fill-ready.server");
    const result = await completeAssemblyImpl(context.supabase as any, data.jobId, context.userId);
    if (!result.ok) throw new Error(result.error);
    return { ok: true };
  });

export const refreshJobAssemblyComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("jobId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { refreshJobAssemblyComponentsImpl } = await import("./fill-ready.server");
    const result = await refreshJobAssemblyComponentsImpl(context.supabase as any, data.jobId);
    if (!result.ok) throw new Error(result.error);
    return result;
  });
