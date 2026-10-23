// Authenticated server functions exposed to the React app for the Fill
// Ready workflow. Real work lives in `fill-ready.server.ts`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertApprovedRole } from "@/lib/approved-role";
import { assertAdminOrManager, userIsAdminOrManager } from "@/lib/require-role";

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
    await assertApprovedRole(context.supabase, context.userId);
    // Reading an existing assembly stays available to any approved role.
    // Creating a replacement assembly in Unleashed is a write, so only
    // admins and managers may take that path.
    const allowUnleashedWrite = await userIsAdminOrManager(context.supabase, context.userId);
    const { refreshJobAssemblyComponentsImpl } = await import("./fill-ready.server");
    const result = await refreshJobAssemblyComponentsImpl(context.supabase as any, data.jobId, {
      allowUnleashedWrite,
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  });

export const refreshJobBomComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("jobId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertApprovedRole(context.supabase, context.userId);
    const { refreshJobBomComponentsImpl } = await import("./fill-ready.server");
    const result = await refreshJobBomComponentsImpl(context.supabase as any, data.jobId);
    if (!result.ok) throw new Error(result.error);
    return result;
  });
