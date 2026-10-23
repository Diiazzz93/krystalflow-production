// Shared gate for server functions that otherwise only check "is logged in".
// Admin, manager, operator, and viewer keep the access they already have.
// Pending accounts, and accounts with no user_roles row, do not.

const APPROVED_ROLES = new Set(["admin", "manager", "operator", "viewer"]);

// The generated Supabase client type is too deep to name as a parameter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoleQuery = { from: (table: string) => any };

export async function assertApprovedRole(supabase: RoleQuery, userId: string): Promise<void> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  const approved = (data ?? []).some((row: { role: string }) => APPROVED_ROLES.has(row.role));
  if (!approved) throw new Error("Account is not approved");
}
