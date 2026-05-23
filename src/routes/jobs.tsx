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
import { JobStockDialog } from "@/components/jobs/JobStockDialog";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  ALL_STATUSES,
  PRIORITY_COLOR,
  STATUS_COLORS,
  fmtDate,
  fmtTime,
  progressPct,
} from "@/lib/utils-domain";
import { Plus, Search, ShieldCheck, LayoutList, Building2, Eye, FileDown } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { Job } from "@/lib/types";
import { downloadJobPdf } from "@/lib/job-pdf";
import { useLineSetups } from "@/lib/line-setups";
import { toast } from "sonner";

export const Route = createFileRoute("/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const { jobs } = useStore();
  const { can } = useAuth();
  const canCreate = can("jobs:create");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [customer, setCustomer] = useState<string>("all");
  const [view, setView] = useState<"list" | "company">("list");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [qcId, setQcId] = useState<string | null>(null);
  const [stockJobId, setStockJobId] = useState<string | null>(null);


  const customers = useMemo(() => {
    const map = new Map<string, string>();
    jobs.forEach((j) => map.set(j.customer, j.customerColor));
    return Array.from(map.entries())
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs]);

  const filtered = useMemo(() => {
    return jobs
      .filter((j) => status === "all" || j.status === status)
      .filter((j) => customer === "all" || j.customer === customer)
      .filter((j) =>
        q
          ? [j.customer, j.product, j.sku, j.operator]
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase())
          : true,
      )
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  }, [jobs, q, status, customer]);

  const grouped = useMemo(() => {
    const map = new Map<string, { color: string; jobs: Job[] }>();
    filtered.forEach((j) => {
      const entry = map.get(j.customer) ?? { color: j.customerColor, jobs: [] };
      entry.jobs.push(j);
      map.set(j.customer, entry);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const openEdit = (id: string) => {
    setEditing(id);
    setOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Jobs</h1>
            <p className="text-sm text-muted-foreground">
              {jobs.length} total · {filtered.length} shown · {customers.length} companies
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setView("list")}
              >
                <LayoutList className="size-4 mr-1" /> List
              </Button>
              <Button
                variant={view === "company" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setView("company")}
              >
                <Building2 className="size-4 mr-1" /> By company
              </Button>
            </div>
            {canCreate && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="size-4 mr-1" /> New job
              </Button>
            )}
          </div>
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
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {view === "list" ? (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <JobsTable jobs={filtered} onEdit={openEdit} onQC={setQcId} onViewStock={setStockJobId} />
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.length === 0 && (
              <div className="rounded-lg border border-border bg-card py-12 text-center text-muted-foreground">
                No jobs match your filters.
              </div>
            )}
            {grouped.map((g) => {
              const upcoming = g.jobs.filter(
                (j) =>
                  j.status !== "Complete" &&
                  new Date(j.scheduledStart) >= new Date(Date.now() - 86400000),
              ).length;
              return (
                <section
                  key={g.name}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                  style={{ borderLeft: `4px solid ${g.color}` }}
                >
                  <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <h2 className="font-semibold text-base">{g.name}</h2>
                    <Badge variant="secondary">{g.jobs.length} jobs</Badge>
                    {upcoming > 0 && <Badge variant="outline">{upcoming} upcoming</Badge>}
                  </header>
                  <div className="overflow-x-auto">
                    <JobsTable jobs={g.jobs} onEdit={openEdit} onQC={setQcId} onViewStock={setStockJobId} hideCustomer />
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <JobDialog jobId={editing} open={open} onOpenChange={setOpen} />
      {qcId && (
        <QCDialog jobId={qcId} open={!!qcId} onOpenChange={(v) => !v && setQcId(null)} />
      )}
      <JobStockDialog
        job={jobs.find((j) => j.id === stockJobId) ?? null}
        open={!!stockJobId}
        onOpenChange={(v) => !v && setStockJobId(null)}
      />
    </AppShell>
  );
}


function JobsTable({
  jobs,
  onEdit,
  onQC,
  onViewStock,
  hideCustomer = false,
}: {
  jobs: Job[];
  onEdit: (id: string) => void;
  onQC: (id: string) => void;
  onViewStock: (id: string) => void;
  hideCustomer?: boolean;
}) {
  const { presets } = useLineSetups();
  const handlePdf = (job: Job) => {
    try {
      downloadJobPdf(job, presets);
      toast.success(`Run sheet PDF generated for ${job.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF");
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{hideCustomer ? "Product" : "Customer / Product"}</TableHead>
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
        {jobs.map((j) => (
          <TableRow key={j.id} className="cursor-pointer hover:bg-accent/40">
            <TableCell onClick={() => onEdit(j.id)}>
              <div className="flex items-center gap-2">
                {!hideCustomer && (
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: j.customerColor }}
                  />
                )}
                <div>
                  {!hideCustomer && <div className="font-medium">{j.customer}</div>}
                  <div className={hideCustomer ? "font-medium" : "text-xs text-muted-foreground"}>
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
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewStock(j.id);
                  }}
                >
                  <Eye className="size-4 mr-1" /> View Job
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePdf(j);
                  }}
                  title="Generate Job PDF run sheet"
                >
                  <FileDown className="size-4 mr-1" /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQC(j.id);
                  }}
                >
                  <ShieldCheck className="size-4 mr-1" /> QC
                </Button>
              </div>
            </TableCell>

          </TableRow>
        ))}
        {jobs.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
              No jobs.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
