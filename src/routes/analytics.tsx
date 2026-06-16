import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { runtimeMinutes, getJobPerformance, fmtDurationMs } from "@/lib/utils-domain";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { jobs, lines } = useStore();

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const isAfter = (iso: string, d: Date) => new Date(iso) >= d;

  const completedToday = jobs.filter(
    (j) =>
      j.status === "Complete" &&
      j.scheduledStart ? new Date(j.scheduledStart).toDateString() : "" === today.toDateString(),
  ).length;
  const completedWeek = jobs.filter(
    (j) => j.status === "Complete" && j.scheduledStart && isAfter(j.scheduledStart, startOfWeek),
  ).length;
  const completedMonth = jobs.filter(
    (j) => j.status === "Complete" && j.scheduledStart && isAfter(j.scheduledStart, startOfMonth),
  ).length;
  const delayed = jobs.filter((j) => j.status === "Delayed").length;
  const totalDowntime = jobs.reduce((s, j) => s + j.downtimeMinutes, 0);
  const completed = jobs.filter((j) => j.status === "Complete");
  const totalBottles = completed.reduce((s, j) => s + j.bottlesCompleted, 0);
  const totalRuntime = completed.reduce((s, j) => s + (j.actualRuntimeMinutes || 1), 0);
  const avgBph = totalRuntime ? Math.round((totalBottles / totalRuntime) * 60) : 0;

  // Efficiency: estimated vs actual runtime (lower actual is better)
  const efficiency = (() => {
    if (!completed.length) return 100;
    const est = completed.reduce((s, j) => s + runtimeMinutes(j), 0);
    const act = completed.reduce((s, j) => s + (j.actualRuntimeMinutes || est), 0);
    return Math.round((est / act) * 100);
  })();

  const lineUtil = useMemo(() => {
    return lines.map((l) => {
      const used = jobs
        .filter((j) => j.line === l.id)
        .reduce((s, j) => s + runtimeMinutes(j) / 60, 0);
      const capacity = 12 * 5; // 12 hr/day, 5 days
      return {
        name: l.name.split("—")[0].trim(),
        utilisation: Math.min(100, Math.round((used / capacity) * 100)),
      };
    });
  }, [jobs, lines]);

  const estVsActual = completed.slice(0, 8).map((j) => ({
    name: j.customer.slice(0, 12),
    estimated: runtimeMinutes(j),
    actual: j.actualRuntimeMinutes,
  }));

  const operatorProductivity = useMemo(() => {
    const map = new Map<string, number>();
    jobs.forEach((j) => {
      if (!j.operator || j.operator === "Unassigned") return;
      map.set(j.operator, (map.get(j.operator) ?? 0) + j.bottlesCompleted);
    });
    return Array.from(map.entries())
      .map(([name, bottles]) => ({ name, bottles }))
      .sort((a, b) => b.bottles - a.bottles);
  }, [jobs]);

  const dailyBottles = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toLocaleDateString(undefined, { weekday: "short" })] = 0;
    }
    jobs.forEach((j) => {
      const d = j.scheduledStart ? new Date(j.scheduledStart) : new Date(0);
      const diff = Math.floor(
        (today.getTime() - d.getTime()) / 86_400_000,
      );
      if (diff >= 0 && diff < 7) {
        const key = d.toLocaleDateString(undefined, { weekday: "short" });
        days[key] = (days[key] ?? 0) + j.bottlesCompleted;
      }
    });
    return Object.entries(days).map(([day, bottles]) => ({ day, bottles }));
  }, [jobs]);

  const COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ec4899"];

  // ---------- Production Performance (planned vs actual) ----------
  const perfRows = useMemo(
    () =>
      jobs
        .map((j) => ({ job: j, perf: getJobPerformance(j) }))
        .filter((r) => r.perf.actualEnd !== null),
    [jobs],
  );
  const earlyJobs = perfRows.filter((r) => r.perf.status === "early");
  const onTimeJobs = perfRows.filter((r) => r.perf.status === "on-time");
  const lateJobs = perfRows.filter((r) => r.perf.status === "late");
  const totalSavedMs = earlyJobs.reduce((s, r) => s + Math.abs(r.perf.diffMs ?? 0), 0);
  const totalLateMs = lateJobs.reduce((s, r) => s + (r.perf.diffMs ?? 0), 0);
  const avgActualMs = perfRows.length
    ? perfRows.reduce((s, r) => s + (r.perf.actualMs ?? 0), 0) / perfRows.length
    : 0;
  const onTimePct = perfRows.length
    ? Math.round(((earlyJobs.length + onTimeJobs.length) / perfRows.length) * 100)
    : 0;
  const prodEfficiency = (() => {
    const planned = perfRows.reduce((s, r) => s + r.perf.plannedMs, 0);
    const actual = perfRows.reduce((s, r) => s + (r.perf.actualMs ?? 0), 0);
    return actual ? Math.round((planned / actual) * 100) : 100;
  })();

  const plannedVsActualData = perfRows.slice(-8).map((r) => ({
    name: r.job.customer.slice(0, 12),
    planned: +(r.perf.plannedMs / 3_600_000).toFixed(1),
    actual: +((r.perf.actualMs ?? 0) / 3_600_000).toFixed(1),
  }));

  const monthlyPerf = useMemo(() => {
    const buckets: Record<string, { month: string; planned: number; actual: number }> = {};
    perfRows.forEach((r) => {
      const d = r.perf.actualEnd!;
      const key = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      if (!buckets[key]) buckets[key] = { month: key, planned: 0, actual: 0 };
      buckets[key].planned += r.perf.plannedMs / 3_600_000;
      buckets[key].actual += (r.perf.actualMs ?? 0) / 3_600_000;
    });
    return Object.values(buckets).map((b) => ({
      month: b.month,
      planned: +b.planned.toFixed(1),
      actual: +b.actual.toFixed(1),
    }));
  }, [perfRows]);

  const onTimeTrend = useMemo(() => {
    const buckets: Record<string, { week: string; total: number; onTime: number }> = {};
    perfRows.forEach((r) => {
      const d = r.perf.actualEnd!;
      const week = new Date(d);
      week.setDate(d.getDate() - d.getDay());
      const key = week.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!buckets[key]) buckets[key] = { week: key, total: 0, onTime: 0 };
      buckets[key].total += 1;
      if (r.perf.status === "early" || r.perf.status === "on-time") buckets[key].onTime += 1;
    });
    return Object.values(buckets).map((b) => ({
      week: b.week,
      onTimePct: Math.round((b.onTime / b.total) * 100),
    }));
  }, [perfRows]);



  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Throughput, efficiency, and operator performance.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Completed today" value={completedToday} />
          <Stat label="Completed this week" value={completedWeek} />
          <Stat label="Completed this month" value={completedMonth} />
          <Stat label="Delayed jobs" value={delayed} />
          <Stat label="Total downtime" value={`${(totalDowntime / 60).toFixed(1)} h`} />
          <Stat label="Avg fill rate" value={`${avgBph.toLocaleString()} bph`} />
          <Stat label="Production efficiency" value={`${efficiency}%`} />
          <Stat label="Total bottles" value={totalBottles.toLocaleString()} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Bottles per day (last 7)</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <LineChart data={dailyBottles}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="bottles" stroke="#0ea5e9" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line utilisation</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={lineUtil}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="utilisation" radius={[6, 6, 0, 0]}>
                    {lineUtil.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estimated vs actual runtime (min)</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {estVsActual.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed jobs yet.</p>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={estVsActual}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="estimated" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operator productivity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {operatorProductivity.length === 0 && (
                <p className="text-sm text-muted-foreground">No operator data.</p>
              )}
              {operatorProductivity.map((op, i) => {
                const max = operatorProductivity[0].bottles || 1;
                const pct = Math.round((op.bottles / max) * 100);
                return (
                  <div key={op.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{op.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {op.bottles.toLocaleString()} btl
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* ---------- Production Performance ---------- */}
        <div className="pt-2">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Production Performance</h2>
          <p className="text-sm text-muted-foreground">
            Planned vs actual job duration across completed jobs.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PerfStat label="Avg job completion" value={perfRows.length ? fmtDurationMs(avgActualMs) : "—"} />
          <PerfStat label="Jobs completed early" value={earlyJobs.length} tone="good" />
          <PerfStat label="Jobs completed late" value={lateJobs.length} tone="bad" />
          <PerfStat label="On-time completion" value={`${onTimePct}%`} tone={onTimePct >= 80 ? "good" : onTimePct >= 50 ? "neutral" : "bad"} />
          <PerfStat label="Total time saved" value={totalSavedMs ? fmtDurationMs(totalSavedMs) : "0h"} tone="good" />
          <PerfStat label="Total delayed time" value={totalLateMs ? fmtDurationMs(totalLateMs) : "0h"} tone="bad" />
          <PerfStat label="Production efficiency" value={`${prodEfficiency}%`} tone={prodEfficiency >= 95 ? "good" : prodEfficiency >= 75 ? "neutral" : "bad"} />
          <PerfStat label="Jobs measured" value={perfRows.length} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Planned vs actual duration (hours)</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {plannedVsActualData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed jobs with actuals yet.</p>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={plannedVsActualData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="h" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="planned" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly production performance</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {monthlyPerf.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={monthlyPerf}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="h" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="planned" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>On-time completion trend</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {onTimeTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={onTimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="onTimePct" stroke="#22c55e" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent jobs — planned vs actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {perfRows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No completed jobs yet. Performance will populate once jobs finish.
                </p>
              )}
              {perfRows
                .slice()
                .reverse()
                .map(({ job, perf }) => {
                  const tone =
                    perf.status === "early"
                      ? "bg-emerald-600"
                      : perf.status === "on-time"
                        ? "bg-emerald-500"
                        : perf.status === "late"
                          ? "bg-red-600"
                          : "bg-slate-500";
                  const diffLabel =
                    perf.diffMs === null
                      ? "—"
                      : perf.status === "on-time"
                        ? "On schedule"
                        : perf.status === "early"
                          ? `${fmtDurationMs(perf.diffMs)} early`
                          : `${fmtDurationMs(perf.diffMs)} late`;
                  return (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge className={`${tone} text-white`}>{perf.status}</Badge>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{job.customer}</div>
                          <div className="text-xs text-muted-foreground truncate">{job.product}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 tabular-nums text-xs">
                        <span className="text-muted-foreground">
                          Planned <span className="text-foreground">{fmtDurationMs(perf.plannedMs)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Actual{" "}
                          <span className="text-foreground">
                            {perf.actualMs !== null ? fmtDurationMs(perf.actualMs) : "—"}
                          </span>
                        </span>
                        <span
                          className={
                            perf.status === "late"
                              ? "text-red-500 font-medium"
                              : perf.status === "early"
                                ? "text-emerald-500 font-medium"
                                : "text-foreground font-medium"
                          }
                        >
                          {diffLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function PerfStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-red-500"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
