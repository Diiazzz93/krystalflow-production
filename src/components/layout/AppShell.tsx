import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  Factory,
  LayoutDashboard,
  LogOut,
  Lock,
  Moon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, useAuth, type Permission } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

const NAV: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
}> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "page:dashboard" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, permission: "page:calendar" },
  { to: "/jobs", label: "Jobs", icon: ClipboardList, permission: "page:jobs" },
  { to: "/live", label: "Live Board", icon: Factory, permission: "page:live" },
  { to: "/qc", label: "Quality", icon: ShieldCheck, permission: "page:qc" },
  { to: "/stock", label: "Stock", icon: Boxes, permission: "page:stock" },
  { to: "/line-setup", label: "Line Setup", icon: SlidersHorizontal, permission: "page:line-setup" },
  { to: "/customer-specs", label: "Customer Specs", icon: ClipboardCheck, permission: "page:customer-specs" },
  { to: "/analytics", label: "Analytics", icon: TrendingUp, permission: "page:analytics" },
  { to: "/settings", label: "Settings", icon: Settings, permission: "page:settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const { user, signOut, can } = useAuth();
  const { branding } = useBranding();

  const visibleNav = NAV.filter((n) => can(n.permission));
  const currentNav = NAV.find((n) =>
    n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to),
  );
  const allowed = currentNav ? can(currentNav.permission) : true;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          {branding.sidebarLogo ? (
            <img src={branding.sidebarLogo} alt="" className="size-9 rounded-md object-contain bg-white/5 p-0.5" />
          ) : (
            <div
              className="size-9 rounded-md grid place-items-center font-bold text-white"
              style={{ background: branding.primaryColor }}
            >
              {branding.companyName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">{branding.companyName}</div>
            <div className="text-xs text-muted-foreground">{branding.appName}</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const active =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
            <div className="px-2">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              <Badge variant="secondary" className="mt-1.5">{ROLE_LABELS[user.role]}</Badge>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => signOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        )}

        <div className="px-4 py-3 border-t border-sidebar-border text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>v0.1 MVP</span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Online
            </span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 bg-background/85 backdrop-blur z-20">
          <div className="md:hidden flex items-center gap-2 font-semibold">
            {branding.sidebarLogo ? (
              <img src={branding.sidebarLogo} alt="" className="size-7 rounded-md object-contain" />
            ) : (
              <div
                className="size-7 rounded-md grid place-items-center text-sm font-bold text-white"
                style={{ background: branding.primaryColor }}
              >
                {branding.companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            {branding.companyName}
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            Production systems nominal
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {ROLE_LABELS[user.role]}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="Sign out" className="md:hidden">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <nav className="md:hidden border-b border-border bg-background overflow-x-auto">
          <div className="flex gap-1 px-2 py-2">
            {visibleNav.map((item) => {
              const active =
                item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0 p-4 md:p-6"
        >
          {allowed ? children : <AccessDenied />}
        </motion.main>
      </div>
    </div>
  );
}

function AccessDenied() {
  const { user } = useAuth();
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="max-w-md text-center space-y-3 p-6 rounded-md border border-border bg-card">
        <div className="mx-auto size-12 rounded-full bg-red-500/15 text-red-400 grid place-items-center">
          <Lock className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">Access restricted</h2>
        <p className="text-sm text-muted-foreground">
          Your role ({user ? ROLE_LABELS[user.role] : "guest"}) does not have permission to view
          this page. Please contact an administrator if you need access.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
