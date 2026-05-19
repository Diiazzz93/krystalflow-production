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
import { runtimeMinutes } from "@/lib/utils-domain";

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
      new Date(j.scheduledStart).toDateString() === today.toDateString(),
  ).length;
  const completedWeek = jobs.filter(
    (j) => j.status === "Complete" && isAfter(j.scheduledStart, startOfWeek),
  ).length;
  const completedMonth = jobs.filter(
    (j) => j.status === "Complete" && isAfter(j.scheduledStart, startOfMonth),
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
      const d = new Date(j.scheduledStart);
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
