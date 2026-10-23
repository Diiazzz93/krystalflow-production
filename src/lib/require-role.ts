// Server-side role check for actions that change records or Unleashed data.
// Reads the caller's own rows in user_roles (allowed by row level security).

// The server Supabase client is generated with a database generic that is
// awkward to thread through every caller, so this stays loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoleClient = { from: (table: string) => any };

export async function userIsAdminOrManager(supabase: RoleClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  const roles = new Set((data ?? []).map((row: { role: string }) => row.role));
  return roles.has("admin") || roles.has("manager");
}

export async function assertAdminOrManager(supabase: RoleClient, userId: string): Promise<void> {
  const allowed = await userIsAdminOrManager(supabase, userId);
  if (!allowed) throw new Error("Only admins and managers can perform this action");
}
