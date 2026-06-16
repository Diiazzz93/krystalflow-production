import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Truck, CheckCircle2, PackageCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAllShipments } from "@/lib/shipments";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/shipping")({
  component: ShippingPage,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function ShippingPage() {
  const { jobs } = useStore();
  const { can } = useAuth();
  const canEdit = can("jobs:update-progress");
  const { items: shipments, markShipped, unmarkShipped } = useAllShipments();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"open" | "today" | "all">("open");

  const shippedByJob = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const s of shipments) {
      if (!m.has(s.jobId)) m.set(s.jobId, new Set());
      m.get(s.jobId)!.add(s.palletNumber);
    }
    return m;
  }, [shipments]);

  const todayStart = startOfToday();
  const shippedToday = useMemo(
    () => shipments.filter((s) => new Date(s.shippedAt) >= todayStart),
    [shipments, todayStart],
  );

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    return jobs
      .filter((j) => (j.pallets ?? 0) > 0)
      .map((j) => {
        const shipped = shippedByJob.get(j.id) ?? new Set<number>();
        return {
          job: j,
          total: j.pallets,
          shippedCount: shipped.size,
          remaining: Math.max(0, j.pallets - shipped.size),
          shippedSet: shipped,
        };
      })
      .filter((r) => {
        if (tab === "open" && r.remaining === 0) return false;
        if (!q) return true;
        return (
          r.job.customer.toLowerCase().includes(q) ||
          r.job.product.toLowerCase().includes(q) ||
          r.job.id.toLowerCase().includes(q) ||
          (r.job.unleashedSalesOrderNumber ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.job.customer.localeCompare(b.job.customer));
  }, [jobs, shippedByJob, tab, q]);

  const totals = useMemo(() => {
    let total = 0;
    let shipped = 0;
    for (const j of jobs) {
      if (!j.pallets) continue;
      total += j.pallets;
      shipped += (shippedByJob.get(j.id)?.size ?? 0);
    }
    return { total, shipped, remaining: Math.max(0, total - shipped) };
  }, [jobs, shippedByJob]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Truck className="size-6" /> Shipping
            </h1>
            <p className="text-sm text-muted-foreground">
              Tick off pallets as the courier picks them up. Updates the linked job in real time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Pallets shipped today" value={shippedToday.length} icon={CheckCircle2} />
          <StatCard label="Pallets remaining (all open jobs)" value={totals.remaining} icon={PackageCheck} />
          <StatCard label="Total pallets across jobs" value={totals.total} icon={Truck} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Jobs with pallets</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search customer, product, SO…"
                  className="pl-8"
                />
              </div>
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-2">
              <TabsList>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="today">Today's pickups</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
              <TabsContent value="today" className="mt-3">
                <TodayList shipments={shippedToday} jobs={jobs} canEdit={canEdit} onUnmark={unmarkShipped} />
              </TabsContent>
            </Tabs>
          </CardHeader>
          {tab !== "today" && (
            <CardContent className="space-y-3">
              {rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  {tab === "open" ? "No open shipments — everything has been picked up." : "No jobs match."}
                </div>
              ) : (
                rows.map((r) => (
                  <div key={r.job.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {r.job.customer} <span className="text-muted-foreground">·</span>{" "}
                          <span className="font-normal">{r.job.product} {r.job.bottleSize}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Job {r.job.id.slice(0, 8)}
                          {r.job.unleashedSalesOrderNumber ? ` · SO ${r.job.unleashedSalesOrderNumber}` : ""}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {r.shippedCount} of {r.total} shipped · {r.remaining} left
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {Array.from({ length: r.total }, (_, i) => i + 1).map((n) => {
                        const isShipped = r.shippedSet.has(n);
                        return (
                          <label
                            key={n}
                            className={cn(
                              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                              isShipped
                                ? "bg-emerald-500/10 border-emerald-500/30"
                                : "bg-card hover:bg-accent/40",
                              !canEdit && "cursor-not-allowed opacity-80",
                            )}
                          >
                            <Checkbox
                              checked={isShipped}
                              disabled={!canEdit}
                              onCheckedChange={(checked) => {
                                if (checked && !isShipped) void markShipped(r.job.id, n);
                                else if (!checked && isShipped) void unmarkShipped(r.job.id, n);
                              }}
                            />
                            <span className="font-medium">P{n}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Truck;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-md bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TodayList({
  shipments,
  jobs,
  canEdit,
  onUnmark,
}: {
  shipments: ReturnType<typeof useAllShipments>["items"];
  jobs: ReturnType<typeof useStore>["jobs"];
  canEdit: boolean;
  onUnmark: (jobId: string, palletNumber: number) => Promise<void>;
}) {
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  if (shipments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No pallets have been shipped today yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {shipments.map((s) => {
        const j = byId.get(s.jobId);
        return (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">
                Pallet {s.palletNumber}
                {j ? ` · ${j.customer} — ${j.product}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(s.shippedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {j ? ` · ${j.pallets ? `of ${j.pallets}` : ""}` : ""}
              </div>
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onUnmark(s.jobId, s.palletNumber)}
              >
                Undo
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
