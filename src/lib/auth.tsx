// Supabase-backed auth + role permissions.
//
// - Session is sourced from Supabase Auth (email/password).
// - The user's role lives in `public.user_roles` and is fetched after sign-in.
// - Permissions are computed entirely client-side from the role string, so the
//   component API (`can(...)`, `hasRole(...)`) is unchanged from the mock
//   version. Server-side enforcement happens via RLS on the database.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "manager" | "operator" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type Permission =
  // Pages
  | "page:dashboard"
  | "page:calendar"
  | "page:jobs"
  | "page:live"
  | "page:qc"
  | "page:stock"
  | "page:shipping"
  | "page:analytics"
  | "page:line-setup"
  | "page:customer-specs"
  | "page:manufacturing"
  | "page:settings"
  // Actions
  | "jobs:create"
  | "jobs:edit"
  | "jobs:delete"
  | "jobs:reschedule"
  | "jobs:update-progress"
  | "qc:complete"
  | "settings:manage"
  | "integrations:manage"
  | "users:manage"
  | "presets:manage"
  | "line-setup:manage"
  | "customer-specs:manage";

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock", "page:shipping", "page:analytics", "page:line-setup",
    "page:customer-specs", "page:manufacturing", "page:settings",
    "jobs:create", "jobs:edit", "jobs:delete", "jobs:reschedule",
    "jobs:update-progress", "qc:complete",
    "settings:manage", "integrations:manage", "users:manage", "presets:manage",
    "line-setup:manage", "customer-specs:manage",
  ],
  manager: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock", "page:shipping", "page:analytics", "page:line-setup",
    "page:customer-specs", "page:manufacturing",
    "jobs:create", "jobs:edit", "jobs:reschedule",
    "jobs:update-progress", "qc:complete",
    "line-setup:manage", "customer-specs:manage",
  ],
  operator: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock", "page:shipping", "page:line-setup", "page:customer-specs",
    "page:manufacturing",
    "jobs:update-progress", "qc:complete",
    "line-setup:manage",
  ],
  viewer: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock", "page:shipping", "page:line-setup", "page:customer-specs",
    "page:manufacturing",
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  manager: "Manager",
  operator: "Operator",
  viewer: "Viewer",
};

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  can: (permission: Permission) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Highest-privilege role wins if a user has multiple (e.g. admin + manager).
const ROLE_PRIORITY: Role[] = ["admin", "manager", "operator", "viewer"];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadAuthUser(userId: string, email: string): Promise<AuthUser | null> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (!rolesError) {
      const roleList = (roles ?? []).map((r) => r.role as Role);
      const role: Role = ROLE_PRIORITY.find((r) => roleList.includes(r)) ?? "viewer";

      return {
        id: userId,
        email,
        name: profileError ? email.split("@")[0] : profile?.name?.trim() || email.split("@")[0],
        role,
      };
    }

    lastError = rolesError.message;
    await wait(250 * (attempt + 1));
  }

  throw new Error(`Unable to load user role: ${lastError ?? "unknown error"}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Listener FIRST (don't await async work inside it — defer it).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setUser(null);
        return;
      }
      // Defer the Supabase read out of the auth callback to avoid deadlocks.
      setLoading(true);
      setTimeout(async () => {
        try {
          const u = await loadAuthUser(session.user.id, session.user.email ?? "");
          if (active) setUser(u);
        } finally {
          if (active) setLoading(false);
        }
      }, 0);
    });

    // THEN check existing session.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      try {
        if (session?.user) {
          const u = await loadAuthUser(session.user.id, session.user.email ?? "");
          if (active) setUser(u);
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { name: name.trim() },
      },
    });
    if (error) return { error: error.message };
    // If email confirmation is required, there's no session yet.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => (user ? PERMISSIONS[user.role].includes(permission) : false),
    [user],
  );

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signUp, signOut, can, hasRole }),
    [user, loading, signIn, signUp, signOut, can, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
