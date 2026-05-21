import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/jobs", label: "Jobs", icon: ClipboardList },
  { to: "/live", label: "Live Board", icon: Factory },
  { to: "/qc", label: "Quality", icon: ShieldCheck },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/analytics", label: "Analytics", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">
            K
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Krystalshield</div>
            <div className="text-xs text-muted-foreground">Production Scheduler</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
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
            <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center text-sm font-bold">
              K
            </div>
            Krystalshield
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            Production systems nominal
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </header>

        <nav className="md:hidden border-b border-border bg-background overflow-x-auto">
          <div className="flex gap-1 px-2 py-2">
            {NAV.map((item) => {
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
          {children}
        </motion.main>
      </div>
    </div>
  );
}
