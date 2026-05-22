// Mock client-side auth + RBAC.
//
// Structured so Supabase Auth can drop in later:
//   - `signIn` / `signOut` are async — swap localStorage for
//     `supabase.auth.signInWithPassword` / `supabase.auth.signOut`.
//   - The `AuthUser` shape mirrors what we'd map from `auth.users` +
//     a `profiles` table (id, email, name, role).
//   - `can(...)` is the only call site components use, so the permission
//     matrix can later be backed by a `user_roles` table without touching
//     components.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Role = "admin" | "manager" | "operator" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const STORAGE_KEY = "krystalflow.auth.user";

// Mock user directory. Password is the same as the role for demo purposes.
export const MOCK_USERS: Array<AuthUser & { password: string }> = [
  { id: "u-admin", email: "admin@krystalflow.app",   name: "Alex Admin",     role: "admin",    password: "admin" },
  { id: "u-mgr",   email: "manager@krystalflow.app", name: "Morgan Manager", role: "manager",  password: "manager" },
  { id: "u-op",    email: "operator@krystalflow.app",name: "Ollie Operator", role: "operator", password: "operator" },
  { id: "u-view",  email: "viewer@krystalflow.app",  name: "Vera Viewer",    role: "viewer",   password: "viewer" },
];

// Permission strings — the only vocabulary components should use.
export type Permission =
  // Pages
  | "page:dashboard"
  | "page:calendar"
  | "page:jobs"
  | "page:live"
  | "page:qc"
  | "page:stock"
  | "page:analytics"
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
  | "presets:manage";

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock", "page:analytics", "page:settings",
    "jobs:create", "jobs:edit", "jobs:delete", "jobs:reschedule",
    "jobs:update-progress", "qc:complete",
    "settings:manage", "integrations:manage", "users:manage", "presets:manage",
  ],
  manager: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock", "page:analytics",
    "jobs:create", "jobs:edit", "jobs:reschedule",
    "jobs:update-progress", "qc:complete",
  ],
  operator: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock",
    "jobs:update-progress", "qc:complete",
  ],
  viewer: [
    "page:dashboard", "page:calendar", "page:jobs", "page:live",
    "page:qc", "page:stock",
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
  signOut: () => Promise<void>;
  can: (permission: Permission) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [loading] = useState(false);

  // Cross-tab sync — also handy when Supabase Auth is added.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setUser(readStoredUser());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const match = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!match) return { error: "Invalid email or password" };
    const { password: _pw, ...safe } = match;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    setUser(safe);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
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
    () => ({ user, loading, signIn, signOut, can, hasRole }),
    [user, loading, signIn, signOut, can, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
