import { useState } from "react";
import { motion } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ACTIVE_STATUSES,
  PRIORITY_COLOR,
  STATUS_COLORS,
  completedPallets,
  estimatedFinish,
  fmtDate,
  fmtTime,
  originalPallets,
  remainingPallets,
} from "@/lib/utils-domain";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Factory,
  Gauge,
  Layers,
  Package,
  Plus,
  Boxes,
} from "lucide-react";
import { JobDialog } from "@/components/jobs/JobDialog";
import { StockAlertsCard } from "@/components/stock/StockAlertsCard";
import { computeJobStockCheck } from "@/lib/job-stock";
import { useStockStore } from "@/lib/stock-store";


export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { jobs, qc } = useStore();
  const { items: stockItems } = useStockStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const today = new Date();
  const isToday = (iso: string) => {
    const d = new Date(iso);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  };
  const isThisWeek = (iso: string) => {
    const d = new Date(iso);
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d >= startOfDay && d < endOfWeek;
  };

  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const todays = jobs.filter((j) => j.scheduledStart && isToday(j.scheduledStart));
  const thisWeek = jobs.filter((j) => j.scheduledStart && isThisWeek(j.scheduledStart) && j.status !== "Complete");
  const delayed = jobs.filter((j) => j.status === "Delayed" || j.status === "Requires Review");
  const completedToday = jobs.filter(
    (j) => j.status === "Complete" && j.scheduledStart && isToday(j.scheduledStart),
  );
  const bottlesToday = todays.reduce((sum, j) => sum + j.bottlesCompleted, 0);
  const palletsToday = qc.filter((q) => isToday(q.timestamp)).length;

  // Aggregate pallet progress across active jobs (Sales Order tracking).
  const palletTotals = active.reduce(
    (acc, j) => {
      acc.total += originalPallets(j);
      acc.done += completedPallets(j);
      acc.remaining += remainingPallets(j);
      return acc;
    },
    { total: 0, done: 0, remaining: 0 },
  );

  // Aggregate remaining materials required across active jobs, based on
  // remaining quantity (not original). Group by SKU + description.
  const remainingMaterials = (() => {
    const map = new Map<string, { description: string; required: number; available: number; unit: string }>();
    for (const j of active) {
      const check = computeJobStockCheck(j, stockItems);
      for (const r of check.requirements) {
        if (r.required <= 0) continue;
        const key = (r.stock?.sku ?? r.description).toLowerCase();
        const prev = map.get(key);
        if (prev) {
          prev.required += r.required;
        } else {
          map.set(key, {
            description: r.description,
            required: r.required,
            available: r.available,
            unit: r.unit,
          });
        }
      }
    }
    return Array.from(map.values())
      .map((m) => ({ ...m, short: Math.max(0, m.required - m.available) }))
      .sort((a, b) => b.short - a.short || b.required - a.required)
      .slice(0, 8);
  })();


  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openJob(id: string) {
    setEditing(id);
    setDialogOpen(true);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {today.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Production Overview
            </h1>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-1" /> New job
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat
            icon={<Factory className="size-4" />}
            label="Active runs"
            value={active.length}
            tone="sky"
          />
          <Stat
            icon={<Layers className="size-4" />}
            label="Pallets ready today"
            value={palletsToday}
            tone="teal"
          />
          <Stat
            icon={<Package className="size-4" />}
            label="Bottles today"
            value={bottlesToday.toLocaleString()}
            tone="emerald"
          />
          <Stat
            icon={<AlertTriangle className="size-4" />}
            label="Needs attention"
            value={delayed.length}
            tone="orange"
          />
          <Stat
            icon={<CheckCircle2 className="size-4" />}
            label="Completed today"
            value={completedToday.length}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Active production</CardTitle>
              <Gauge className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {active.length === 0 && (
                <p className="text-sm text-muted-foreground">No jobs currently running.</p>
              )}
              {active.map((j) => {
                const jobQc = qc
                  .filter((q) => q.jobId === j.id)
                  .sort(
                    (a, b) =>
                      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                  );
                const liveBottles = jobQc.reduce(
                  (sum, q) => sum + (q.bottleCount || 0),
                  0,
                );
                const bottles = Math.max(j.bottlesCompleted, liveBottles);
                const pct = j.quantity
                  ? Math.min(100, Math.round((bottles / j.quantity) * 100))
                  : 0;
                const last = jobQc[0];
                const secsAgo = last
                  ? Math.round((Date.now() - new Date(last.timestamp).getTime()) / 1000)
                  : null;
                const ago =
                  secsAgo == null
                    ? null
                    : secsAgo < 60
                      ? `${secsAgo}s ago`
                      : secsAgo < 3600
                        ? `${Math.floor(secsAgo / 60)}m ago`
                        : `${Math.floor(secsAgo / 3600)}h ago`;
                return (
                  <motion.button
                    key={j.id}
                    whileHover={{ x: 2 }}
                    onClick={() => openJob(j.id)}
                    className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: j.customerColor }}
                          />
                          <span className="font-semibold truncate">{j.customer}</span>
                          <Badge className={STATUS_COLORS[j.status]}>{j.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {j.product} · {j.bottleSize} · {j.sku}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" /> ETA {fmtTime(estimatedFinish(j))}
                        </div>
                        <div>{j.operator || "Unassigned"}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="text-xs font-medium tabular-nums w-24 text-right">
                        {bottles.toLocaleString()} / {j.quantity.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {last ? (
                          <>
                            <span className="relative flex size-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                            </span>
                            <span>
                              {jobQc.length} pallet{jobQc.length === 1 ? "" : "s"} QC'd
                              {ago ? ` · last ${ago}` : ""}
                            </span>
                          </>
                        ) : (
                          <span>No QC entries yet</span>
                        )}
                      </div>
                      {last && (
                        <span className="tabular-nums">
                          Pallet #{last.palletNumber} · {last.bottleCount} bottles ·{" "}
                          <span
                            className={
                              last.result === "Pass"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }
                          >
                            {last.result}
                          </span>
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}

            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming this week</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {thisWeek.length === 0 && (
                <p className="text-sm text-muted-foreground">No jobs scheduled this week.</p>
              )}
              {thisWeek.map((j) => (
                <button
                  key={j.id}
                  onClick={() => openJob(j.id)}
                  className="w-full text-left rounded-md px-2 py-2 hover:bg-accent/50 flex items-center gap-2"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: j.customerColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{j.customer}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {fmtDate(j.scheduledStart)} · {fmtTime(j.scheduledStart)} · {j.line} · {j.product}
                    </div>
                  </div>
                  <Badge variant="outline" className={PRIORITY_COLOR[j.priority]}>
                    {j.priority}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" />
                Production progress
              </CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {palletTotals.done} / {palletTotals.total} pallets
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress
                value={palletTotals.total ? Math.round((palletTotals.done / palletTotals.total) * 100) : 0}
                className="h-2"
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                <PalletStat label="Total" value={palletTotals.total} />
                <PalletStat label="Completed" value={palletTotals.done} tone="emerald" />
                <PalletStat label="Remaining" value={palletTotals.remaining} tone="amber" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Across {active.length} active job{active.length === 1 ? "" : "s"}. Source Sales Orders in Unleashed are never modified.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Boxes className="size-4 text-muted-foreground" />
                Remaining materials required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {remainingMaterials.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No outstanding material requirements — calculated from remaining quantities only.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {remainingMaterials.map((m) => (
                    <li
                      key={m.description}
                      className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"
                    >
                      <span className="text-sm truncate pr-2">{m.description}</span>
                      <span className="text-xs tabular-nums shrink-0">
                        <span className={m.short > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-foreground"}>
                          {m.required.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground"> {m.unit}</span>
                        {m.short > 0 && (
                          <span className="ml-2 text-red-600 dark:text-red-400">
                            ({m.short.toLocaleString()} short)
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StockAlertsCard />
        </div>


        {delayed.length > 0 && (
          <Card className="border-orange-500/40 bg-orange-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <AlertTriangle className="size-4" />
                Requires attention
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {delayed.map((j) => (
                <button
                  key={j.id}
                  onClick={() => openJob(j.id)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{j.customer}</span>
                    <Badge className={STATUS_COLORS[j.status]}>{j.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {j.product} · due {fmtDate(j.dueDate)}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <JobDialog jobId={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppShell>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "sky" | "emerald" | "orange" | "violet" | "teal";
}) {
  const toneMap = {
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  } as const;
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`size-9 rounded-md grid place-items-center ${toneMap[tone]}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
