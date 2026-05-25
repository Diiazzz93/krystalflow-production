import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Beaker,
  Boxes,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  Factory,
  FileCog,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  Lock,
  Menu,
  Moon,
  Package,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, useAuth, type Permission } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

type NavLeaf = {
  kind: "link";
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
  search?: Record<string, string>;
  /** Match when location.pathname === to AND search.tab matches (if provided). */
  matchTab?: string;
};

type NavGroup = {
  kind: "group";
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
  /** Base path used to auto-open the group when active. */
  basePath: string;
  children: Array<NavLeaf | NavGroup>;
};

type NavNode = NavLeaf | NavGroup;

const NAV: NavNode[] = [
  { kind: "link", to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "page:dashboard" },
  { kind: "link", to: "/calendar", label: "Calendar", icon: CalendarDays, permission: "page:calendar" },
  { kind: "link", to: "/jobs", label: "Jobs", icon: ClipboardList, permission: "page:jobs" },
  { kind: "link", to: "/live", label: "Live Board", icon: Factory, permission: "page:live" },
  { kind: "link", to: "/qc", label: "Quality Control", icon: ShieldCheck, permission: "page:qc" },
  { kind: "link", to: "/stock", label: "Stock", icon: Boxes, permission: "page:stock" },
  { kind: "link", to: "/line-setup", label: "Line Setup", icon: SlidersHorizontal, permission: "page:line-setup" },
  { kind: "link", to: "/customer-specs", label: "Customer Specs", icon: ClipboardCheck, permission: "page:customer-specs" },
  {
    kind: "group",
    label: "Manufacturing",
    icon: FlaskConical,
    permission: "page:manufacturing",
    basePath: "/manufacturing",
    children: [
      {
        kind: "group",
        label: "Assemblies",
        icon: Wrench,
        permission: "page:manufacturing",
        basePath: "/manufacturing",
        children: [
          { kind: "link", to: "/manufacturing", label: "Production Runs", icon: Wrench, permission: "page:manufacturing", search: { tab: "assemblies" }, matchTab: "assemblies" },
          { kind: "link", to: "/manufacturing", label: "Batch History", icon: History, permission: "page:manufacturing", search: { tab: "history" }, matchTab: "history" },
        ],
      },
      {
        kind: "group",
        label: "Bill of Materials",
        icon: FileCog,
        permission: "page:manufacturing",
        basePath: "/manufacturing",
        children: [
          { kind: "link", to: "/manufacturing", label: "Bulk Formula BOMs", icon: Beaker, permission: "page:manufacturing", search: { tab: "bulk" }, matchTab: "bulk" },
          { kind: "link", to: "/manufacturing", label: "Finished Product BOMs", icon: Package, permission: "page:manufacturing", search: { tab: "finished" }, matchTab: "finished" },
        ],
      },
      { kind: "link", to: "/manufacturing", label: "Manufacturing Stock", icon: Warehouse, permission: "page:manufacturing", search: { tab: "stock" }, matchTab: "stock" },
      { kind: "link", to: "/manufacturing", label: "Import / Export", icon: Package, permission: "page:manufacturing", search: { tab: "io" }, matchTab: "io" },
    ],
  },
  { kind: "link", to: "/analytics", label: "Analytics", icon: TrendingUp, permission: "page:analytics" },
  { kind: "link", to: "/settings", label: "Settings", icon: Settings, permission: "page:settings" },
];

function filterNav(nodes: NavNode[], can: (p: Permission) => boolean): NavNode[] {
  const out: NavNode[] = [];
  for (const n of nodes) {
    if (!can(n.permission)) continue;
    if (n.kind === "group") {
      const children = filterNav(n.children, can);
      if (children.length === 0) continue;
      out.push({ ...n, children });
    } else {
      out.push(n);
    }
  }
  return out;
}

function findActiveLeaf(
  nodes: NavNode[],
  pathname: string,
  tab: string | undefined,
): NavLeaf | undefined {
  // Prefer most specific match: exact pathname + tab match wins over pathname-only.
  let best: { leaf: NavLeaf; score: number } | undefined;
  const walk = (list: NavNode[]) => {
    for (const n of list) {
      if (n.kind === "group") {
        walk(n.children);
      } else {
        const pathMatches = n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(n.to + "/");
        if (!pathMatches) continue;
        let score = 1;
        if (n.matchTab) {
          if ((tab ?? undefined) === n.matchTab) score = 3;
          else continue;
        } else if (!tab) {
          score = 2;
        }
        if (!best || score > best.score) best = { leaf: n, score };
      }
    }
  };
  walk(nodes);
  return best?.leaf;
}

function groupContainsLeaf(group: NavGroup, leaf: NavLeaf | undefined): boolean {
  if (!leaf) return false;
  const walk = (list: NavNode[]): boolean => {
    for (const n of list) {
      if (n.kind === "group") {
        if (walk(n.children)) return true;
      } else if (n === leaf) {
        return true;
      }
    }
    return false;
  };
  return walk(group.children);
}

function NavLeafItem({
  leaf,
  touch,
  depth,
  active,
  onNavigate,
}: {
  leaf: NavLeaf;
  touch: boolean;
  depth: number;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = leaf.icon;
  return (
    <Link
      to={leaf.to}
      search={leaf.search as never}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md font-medium transition-colors",
        touch ? "px-4 py-3 text-base min-h-12" : "px-3 py-2 text-sm",
        depth === 1 && (touch ? "pl-10" : "pl-8"),
        depth >= 2 && (touch ? "pl-14" : "pl-12"),
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className={touch ? "size-5" : "size-4"} />
      <span className="truncate">{leaf.label}</span>
    </Link>
  );
}

function NavGroupItem({
  group,
  touch,
  depth,
  activeLeaf,
  onNavigate,
}: {
  group: NavGroup;
  touch: boolean;
  depth: number;
  activeLeaf: NavLeaf | undefined;
  onNavigate?: () => void;
}) {
  const containsActive = groupContainsLeaf(group, activeLeaf);
  const [open, setOpen] = useState<boolean>(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const Icon = group.icon;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "w-full flex items-center gap-3 rounded-md font-medium transition-colors",
          touch ? "px-4 py-3 text-base min-h-12" : "px-3 py-2 text-sm",
          depth === 1 && (touch ? "pl-10" : "pl-8"),
          depth >= 2 && (touch ? "pl-14" : "pl-12"),
          containsActive
            ? "text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className={touch ? "size-5" : "size-4"} />
        <span className="flex-1 text-left truncate">{group.label}</span>
        <ChevronRight
          className={cn(
            "size-4 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="mt-1 space-y-1">
          {group.children.map((child) =>
            child.kind === "group" ? (
              <NavGroupItem
                key={child.label}
                group={child}
                touch={touch}
                depth={depth + 1}
                activeLeaf={activeLeaf}
                onNavigate={onNavigate}
              />
            ) : (
              <NavLeafItem
                key={child.label + child.to + (child.matchTab ?? "")}
                leaf={child}
                touch={touch}
                depth={depth + 1}
                active={activeLeaf === child}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppShell({ children }: { children: ReactNode }) {

  const { theme, toggle } = useTheme();
  const location = useLocation();
  // Read tab search param when on the manufacturing route (safe-cast; undefined elsewhere).
  const searchAll = useSearch({ strict: false }) as { tab?: string };
  const activeTab = searchAll?.tab;
  const { user, signOut, can } = useAuth();
  const { branding } = useBranding();

  const visibleNav = filterNav(NAV, can);
  const activeLeaf = findActiveLeaf(visibleNav, location.pathname, activeTab);

  // Permission check for the current page (top-level): walk groups to find the
  // first link whose pathname covers location.pathname.
  const allowed = (() => {
    if (activeLeaf) return can(activeLeaf.permission);
    return true;
  })();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const brandMark = (size: "sm" | "md" = "md") => {
    const cls = size === "sm" ? "size-8" : "size-9";
    return branding.sidebarLogo ? (
      <img
        src={branding.sidebarLogo}
        alt=""
        className={cn(cls, "rounded-md object-contain bg-white/5 p-0.5")}
      />
    ) : (
      <div
        className={cn(cls, "rounded-md grid place-items-center font-bold text-white")}
        style={{ background: branding.primaryColor }}
      >
        {branding.companyName.slice(0, 1).toUpperCase()}
      </div>
    );
  };

  const NavList = ({ touch = false, onNavigate }: { touch?: boolean; onNavigate?: () => void }) => (
    <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
      {visibleNav.map((node) =>
        node.kind === "group" ? (
          <NavGroupItem
            key={node.label}
            group={node}
            touch={touch}
            depth={0}
            activeLeaf={activeLeaf}
            onNavigate={onNavigate}
          />
        ) : (
          <NavLeafItem
            key={node.to}
            leaf={node}
            touch={touch}
            depth={0}
            active={activeLeaf === node}
            onNavigate={onNavigate}
          />
        ),
      )}
    </nav>
  );



  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          {brandMark("md")}
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">{branding.companyName}</div>
            <div className="text-xs text-muted-foreground">{branding.appName}</div>
          </div>
        </div>

        <NavList />

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
        <header
          className="border-b border-border flex items-center justify-between gap-2 px-3 md:px-6 sticky top-0 bg-background/85 backdrop-blur z-20"
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            paddingBottom: "0.5rem",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  className="md:hidden min-h-11 min-w-11"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 p-0 flex flex-col bg-sidebar text-sidebar-foreground"
              >
                <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
                  {brandMark("md")}
                  <div className="leading-tight">
                    <div className="font-semibold tracking-tight">{branding.companyName}</div>
                    <div className="text-xs text-muted-foreground">{branding.appName}</div>
                  </div>
                </div>
                <NavList touch onNavigate={() => setMobileNavOpen(false)} />
                {user && (
                  <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
                    <div className="px-2">
                      <div className="text-sm font-medium truncate">{user.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      <Badge variant="secondary" className="mt-1.5">
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full min-h-11"
                      onClick={() => {
                        setMobileNavOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="size-4" /> Sign out
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            <div className="md:hidden flex items-center gap-2 font-semibold min-w-0 truncate">
              {brandMark("sm")}
              <span className="truncate">{branding.appName}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              Production systems nominal
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {user && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {ROLE_LABELS[user.role]}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Toggle theme"
              className="min-h-11 min-w-11"
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut()}
              aria-label="Sign out"
              className="md:hidden min-h-11 min-w-11"
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </header>


        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0 p-3 sm:p-4 md:p-6"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
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
