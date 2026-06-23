import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "operator", "viewer"]),
  name: z.string().optional(),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Caller must be admin
    const { data: isAdmin, error: roleErr } = await (context.supabase.rpc as any)("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Only admins can invite users");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const redirectTo = (process.env.SITE_URL ?? "") + "/auth";

    const { data: invited, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: data.name ? { name: data.name } : undefined,
        redirectTo: redirectTo || undefined,
      });

    if (inviteErr) throw new Error(inviteErr.message);
    const newUserId = invited.user?.id;
    if (!newUserId) throw new Error("Invite did not return a user id");

    // The handle_new_user trigger inserts a default 'viewer' role.
    // Replace with the requested role if different.
    if (data.role !== "viewer") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (rErr) throw new Error(rErr.message);
    }

    return { ok: true, userId: newUserId, email: data.email };
  });

const deleteSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Caller must be admin — query user_roles directly to avoid enum-cast issues with rpc
    const { data: adminRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!adminRow) throw new Error("Only admins can delete users");

    if (data.userId === context.userId) {
      throw new Error("You can't delete your own account from here");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    // Cascade removes profile + user_roles via foreign keys on auth.users
    return { ok: true, userId: data.userId };
  });

