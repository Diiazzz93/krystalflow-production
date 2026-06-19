import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/auth";
import { inviteUser } from "@/lib/users.functions";

const ROLE_PRIORITY: Role[] = ["admin", "manager", "operator", "viewer"];
const ALL_ROLES: Role[] = ["admin", "manager", "operator", "viewer"];

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function UserManagementPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, email, name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const rolesByUser = new Map<string, Role[]>();
      (roles ?? []).forEach((r) => {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role as Role);
        rolesByUser.set(r.user_id, list);
      });

      const rows: UserRow[] = (profiles ?? []).map((p) => {
        const userRoles = rolesByUser.get(p.id) ?? [];
        const role = ROLE_PRIORITY.find((r) => userRoles.includes(r)) ?? "viewer";
        return { id: p.id, email: p.email, name: p.name || p.email.split("@")[0], role };
      });
      rows.sort((a, b) => a.email.localeCompare(b.email));
      setUsers(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load users";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(userId: string, newRole: Role) {
    setSavingId(userId);
    try {
      // Replace all existing role rows for this user with the single new role.
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole });
      if (insErr) throw insErr;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      toast.success(`Role updated to ${ROLE_LABELS[newRole]}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update role";
      toast.error(msg);
      load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" /> User management
        </CardTitle>
        <CardDescription>
          Assign roles to control what each user can access. Admins have full access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {u.name}
                      {isSelf && <Badge variant="secondary">You</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingId === u.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                    <Select
                      value={u.role}
                      disabled={savingId === u.id || isSelf}
                      onValueChange={(v) => changeRole(u.id, v as Role)}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {currentUser && (
          <p className="mt-3 text-xs text-muted-foreground">
            You can't change your own role to prevent accidentally locking yourself out.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
