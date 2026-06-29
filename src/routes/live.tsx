import { useState } from "react";
import { motion } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/lib/store";
import {
  ACTIVE_STATUSES,
  STATUS_COLORS,
  STATUS_DOT,
  estimatedFinish,
  fmtTime,
  progressPct,
} from "@/lib/utils-domain";
import { JobDialog } from "@/components/jobs/JobDialog";
import { QCDialog } from "@/components/jobs/QCDialog";
import { AlertTriangle, Clock, ShieldCheck, Timer, User } from "lucide-react";

export const Route = createFileRoute("/live")({
  component: LivePage,
});

function LivePage() {
  const { jobs, lines } = useStore();
  const [editId, setEditId] = useState<string | null>(null);
  const [qcId, setQcId] = usePersistedQcId();

  const issuesCount = jobs.filter(
    (j) => j.status === "Delayed" || j.status === "Requires Review",
  ).length;

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Live factory floor
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Production Board</h1>
          </div>
          {issuesCount > 0 && (
            <Badge className="bg-orange-600 text-white text-sm">
              <AlertTriangle className="size-3.5 mr-1" /> {issuesCount} active issue
              {issuesCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lines.map((line) => {
            const lineJobs = jobs.filter((j) => j.line === line.id || j.line === line.name);
            const running = lineJobs.find((j) => ACTIVE_STATUSES.includes(j.status));
            const PLANNED_STATUSES = new Set([
              "Scheduled",
              "Pending Assembly Approval",
              "Assembly Completed",
              "On Hold",
              "Delayed",
              "Requires Review",
            ]);
            const upcoming = lineJobs
              .filter(
                (j) =>
                  j.id !== running?.id &&
                  !!j.scheduledStart &&
                  PLANNED_STATUSES.has(j.status),
              )
              .sort(
                (a, b) =>
                  new Date(a.scheduledStart!).getTime() -
                  new Date(b.scheduledStart!).getTime(),
              );
            return (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{line.name}</CardTitle>
                      <Badge
                        className={
                          running ? "bg-emerald-600 text-white" : "bg-zinc-500 text-white"
                        }
                      >
                        {running ? "Running" : "Idle"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Capacity {line.capacityBph.toLocaleString()} btl/hr
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {running ? (
                      <div className="space-y-3">
                        <button
                          onClick={() => setEditId(running.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`size-2.5 rounded-full ${STATUS_DOT[running.status]}`} />
                            <span className="font-semibold truncate">{running.customer}</span>
                            <Badge className={STATUS_COLORS[running.status]}>
                              {running.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {running.product} · {running.bottleSize}
                          </p>
                        </button>

                        <Progress value={progressPct(running)} />
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <MetricMini
                            icon={<User className="size-3.5" />}
                            label="Operator"
                            value={running.operator || "—"}
                          />
                          <MetricMini
                            icon={<Clock className="size-3.5" />}
                            label="ETA"
                            value={fmtTime(estimatedFinish(running))}
                          />
                          <MetricMini
                            label="Bottles"
                            value={`${running.bottlesCompleted.toLocaleString()} / ${running.quantity.toLocaleString()}`}
                          />
                          <MetricMini
                            label="Pallets"
                            value={`${running.palletsCompleted} / ${running.pallets}`}
                          />
                          <MetricMini
                            icon={<Timer className="size-3.5" />}
                            label="Downtime"
                            value={`${running.downtimeMinutes}m`}
                          />
                          <MetricMini
                            label="Speed"
                            value={`${running.bottlesPerHour.toLocaleString()} bph`}
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setQcId(running.id)}
                          >
                            <ShieldCheck className="size-4 mr-1" /> Log QC
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => setEditId(running.id)}
                          >
                            Manage
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
                        No active run on this line
                      </p>
                    )}

                    {upcoming.length > 0 && (
                      <div className="border-t border-border pt-3 space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Up next ({upcoming.length})
                        </p>
                        {upcoming.map((nx) => (
                          <button
                            key={nx.id}
                            onClick={() => setEditId(nx.id)}
                            className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent/40"
                          >
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="font-medium truncate flex items-center gap-1.5">
                                <span className={`size-1.5 rounded-full ${STATUS_DOT[nx.status]}`} />
                                {nx.customer}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {fmtTime(nx.scheduledStart)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground truncate">{nx.product}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {nx.status}
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      <JobDialog jobId={editId} open={!!editId} onOpenChange={(v) => !v && setEditId(null)} />
      {qcId && (
        <QCDialog jobId={qcId} open={!!qcId} onOpenChange={(v) => !v && setQcId(null)} />
      )}
    </AppShell>
  );
}

function MetricMini({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}
