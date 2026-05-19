import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JobDialog } from "@/components/jobs/JobDialog";
import { QCDialog } from "@/components/jobs/QCDialog";
import { useStore } from "@/lib/store";
import {
  ALL_STATUSES,
  PRIORITY_COLOR,
  STATUS_COLORS,
  fmtDate,
  fmtTime,
  progressPct,
} from "@/lib/utils-domain";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const { jobs } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [qcId, setQcId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return jobs
      .filter((j) => status === "all" || j.status === status)
      .filter((j) =>
        q
          ? [j.customer, j.product, j.sku, j.operator]
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase())
          : true,
      )
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  }, [jobs, q, status]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Jobs</h1>
            <p className="text-sm text-muted-foreground">
              {jobs.length} total · {filtered.length} shown
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4 mr-1" /> New job
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, product, SKU, operator"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer / Product</TableHead>
                <TableHead>Line</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Progress</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((j) => (
                <TableRow key={j.id} className="cursor-pointer hover:bg-accent/40">
                  <TableCell
                    onClick={() => {
                      setEditing(j.id);
                      setOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: j.customerColor }}
                      />
                      <div>
                        <div className="font-medium">{j.customer}</div>
                        <div className="text-xs text-muted-foreground">
                          {j.product} · {j.sku} · {j.bottleSize}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{j.line}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fmtDate(j.scheduledStart)} {fmtTime(j.scheduledStart)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{fmtDate(j.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={PRIORITY_COLOR[j.priority]}>
                      {j.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[j.status]}>{j.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={progressPct(j)} className="h-1.5 flex-1" />
                      <span className="text-xs tabular-nums">{progressPct(j)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQcId(j.id);
                      }}
                    >
                      <ShieldCheck className="size-4 mr-1" /> QC
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No jobs match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <JobDialog jobId={editing} open={open} onOpenChange={setOpen} />
      {qcId && (
        <QCDialog jobId={qcId} open={!!qcId} onOpenChange={(v) => !v && setQcId(null)} />
      )}
    </AppShell>
  );
}
