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
