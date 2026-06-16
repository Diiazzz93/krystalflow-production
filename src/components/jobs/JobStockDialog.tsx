import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, FileDown, PackageCheck, Printer } from "lucide-react";
import type { Job, Priority } from "@/lib/types";
import { PRIORITIES } from "@/lib/utils-domain";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { computeJobStockCheck } from "@/lib/job-stock";
import { JobStockCheck } from "./JobStockCheck";
import { cn } from "@/lib/utils";
import { downloadJobPdf, printJobPdf } from "@/lib/job-pdf";
import { useLineSetups } from "@/lib/line-setups";
import { useCustomerSpecs } from "@/lib/customer-specs";
import { CustomerSpecsView } from "@/components/customer-specs/CustomerSpecsView";
import { toast } from "sonner";
import { useStockStore } from "@/lib/stock-store";
import type { StockItem } from "@/lib/stock";
import { refreshJobAssemblyComponents } from "@/lib/unleashed/fill-ready.functions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


interface Props {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function JobStockDialog({ job, open, onOpenChange }: Props) {
  const { presets } = useLineSetups();
  const { getSpecForJob } = useCustomerSpecs();
  const { items: stockItems } = useStockStore();
  const { updateJob, lines } = useStore();
  const { can } = useAuth();
  const canEdit = can("jobs:edit") || can("jobs:create");
  const refreshAssembly = useServerFn(refreshJobAssemblyComponents);
  const [assemblyPatch, setAssemblyPatch] = useState<(Partial<Job> & { jobId: string }) | null>(null);

  useEffect(() => {
    setAssemblyPatch(null);
  }, [job?.id]);

  useEffect(() => {
    const hasComponents = (job?.assemblyComponents?.length ?? 0) > 0 || (assemblyPatch?.assemblyComponents?.length ?? 0) > 0;
    const hasLinkedAssembly = Boolean(job?.unleashedAssemblyNumber || job?.assemblyStatus || (job as unknown as { unleashed_assembly_number?: string } | null)?.unleashed_assembly_number);
    if (!open || !job || hasComponents || !hasLinkedAssembly || assemblyPatch?.jobId === job.id) return;
    const jobId = job.id;
    let cancelled = false;
    refreshAssembly({ data: { jobId } })
      .then((result) => {
        if (cancelled) return;
        setAssemblyPatch({
          jobId,
          assemblyComponents: result.assemblyComponents,
          assemblyStatus: result.assemblyStatus ?? undefined,
          assemblyCreatedAt: result.assemblyCreatedAt ?? undefined,
          unleashedAssemblyNumber: result.unleashedAssemblyNumber ?? undefined,
          unleashedSalesOrderNumber: result.unleashedSalesOrderNumber ?? undefined,
        });
      })
      .catch((error) => console.error("[jobs] assembly component refresh failed", error));
    return () => {
      cancelled = true;
    };
  }, [open, job, assemblyPatch, refreshAssembly]);

  const hydratedJob = useMemo(() => {
    if (!job) return null;
    return assemblyPatch?.jobId === job.id ? ({ ...job, ...assemblyPatch } as Job) : job;
  }, [job, assemblyPatch]);

  if (!hydratedJob) return null;
  const currentJob = hydratedJob;
  const check = computeJobStockCheck(currentJob, stockItems);
  const totalMissing = check.requirements.reduce((s, r) => s + r.missing, 0);
  const productLabel = `${currentJob.product} ${currentJob.bottleSize}`.trim();
  const resolvedSpec = getSpecForJob(currentJob.customer, productLabel);

  const handleDownload = () => {
    try {
      downloadJobPdf(currentJob, presets);
      toast.success(`Run sheet PDF generated for ${currentJob.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF");
    }
  };
  const handlePrint = () => {
    try {
      printJobPdf(currentJob, presets);
    } catch (e) {
      console.error(e);
      toast.error("Could not open print preview");
    }
  };

  const summaryTone = !check.hasSelections
    ? "border-border bg-muted/20 text-muted-foreground"
    : check.hasShort
    ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Stock requirements — {currentJob.id}</DialogTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="size-4 mr-1" /> Print
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <FileDown className="size-4 mr-1" /> Generate Job PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className={cn("rounded-lg border p-3 flex items-center gap-3", summaryTone)}>
          {!check.hasSelections ? (
            <PackageCheck className="size-5" />
          ) : check.hasShort ? (
            <AlertTriangle className="size-5" />
          ) : (
            <CheckCircle2 className="size-5" />
          )}
          <div className="flex-1">
            <div className="font-semibold">
              {!check.hasSelections
                ? "No stock selected"
                : check.hasShort
                  ? "Stock Shortage Detected"
                  : "Ready to Run"}
            </div>
            {check.hasShort && (
              <div className="text-xs">
                {check.shortCount} item{check.shortCount === 1 ? "" : "s"} short ·{" "}
                {totalMissing.toLocaleString()} units needed
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="assembly">
              Assembly
              {currentJob.assemblyComponents && currentJob.assemblyComponents.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {currentJob.assemblyComponents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="specs">
              Production Specs
              {resolvedSpec && (
                <Badge variant="secondary" className="ml-2">
                  {resolvedSpec.source === "product" ? "product" : "default"}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-medium text-sm">Job details</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <Detail label="Job number" value={currentJob.id} />
                <Detail label="Customer" value={currentJob.customer} />
                <Detail label="Product" value={`${currentJob.product} ${currentJob.bottleSize}`.trim()} />
                <Detail
                  label="Planned quantity"
                  value={(() => {
                    const cartons = currentJob.cartonsOrdered;
                    const perCarton = currentJob.bottlesPerCarton;
                    if (cartons && perCarton && perCarton > 1) {
                      const pack = currentJob.bottleSize ? `${perCarton} × ${currentJob.bottleSize}` : `${perCarton} bottles`;
                      return (
                        <span>
                          {cartons.toLocaleString()} cartons ({pack})
                          <span className="text-muted-foreground"> · {currentJob.quantity.toLocaleString()} bottles</span>
                        </span>
                      );
                    }
                    return `${currentJob.quantity.toLocaleString()} bottles`;
                  })()}
                />
                <Detail label="Filling line" value={currentJob.line} />
                <Detail label="Status" value={<Badge variant="outline">{currentJob.status}</Badge>} />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="font-medium text-sm flex items-center justify-between">
                <span>Schedule &amp; priority</span>
                {!canEdit && <span className="text-xs text-muted-foreground">Read only</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled start</div>
                  <Input
                    type="datetime-local"
                    disabled={!canEdit}
                    value={toLocalInput(currentJob.scheduledStart)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      void updateJob(currentJob.id, { scheduledStart: new Date(v).toISOString() });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled end</div>
                  <Input
                    type="datetime-local"
                    disabled={!canEdit}
                    value={toLocalInput(currentJob.scheduledEnd)}
                    onChange={(e) =>
                      void updateJob(currentJob.id, {
                        scheduledEnd: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Priority</div>
                  <Select
                    value={currentJob.priority}
                    disabled={!canEdit}
                    onValueChange={(v) => void updateJob(currentJob.id, { priority: v as Priority })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Filling line</div>
                  <Select
                    value={currentJob.line || "__none__"}
                    disabled={!canEdit}
                    onValueChange={(v) => void updateJob(currentJob.id, { line: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select line…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {lines.map((l) => (
                        <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Current: {fmtDate(currentJob.scheduledStart)}
                {currentJob.scheduledEnd ? ` → ${fmtDate(currentJob.scheduledEnd)}` : ""}
              </div>
            </div>

            <AssemblyInfoBlock job={currentJob} />
          </TabsContent>


          <TabsContent value="stock">
            <JobStockCheck job={currentJob} />
          </TabsContent>

          <TabsContent value="assembly" className="space-y-3">
            <AssemblyInfoBlock job={currentJob} />
            <AssemblyComponentsTable job={currentJob} stockItems={stockItems} />
          </TabsContent>


          <TabsContent value="specs" className="space-y-3">
            {resolvedSpec ? (
              <>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                  <span className="font-medium">Showing:</span>
                  {resolvedSpec.source === "product" ? (
                    <>
                      <Badge variant="default">Product spec</Badge>
                      <span className="font-medium">{resolvedSpec.productName}</span>
                      <span className="text-muted-foreground">· {resolvedSpec.customer}</span>
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary">Customer default</Badge>
                      <span className="text-muted-foreground">
                        No product-specific override for "{productLabel}" — falling back to {resolvedSpec.customer} defaults.
                      </span>
                    </>
                  )}
                </div>
                <CustomerSpecsView spec={resolvedSpec} compact />
                {(resolvedSpec.lineSetupNotes || resolvedSpec.specialInstructions) && (
                  <div className="rounded-md border border-border p-3 grid md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Line setup notes</div>
                      <div className="whitespace-pre-wrap">{resolvedSpec.lineSetupNotes || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Special instructions</div>
                      <div className="whitespace-pre-wrap">{resolvedSpec.specialInstructions || "—"}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No production specs saved for <strong>{currentJob.customer}</strong>.
                <br />
                Add them in the <strong>Customer Specs</strong> section.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function AssemblyInfoBlock({ job }: { job: Job }) {
  const extra = job as unknown as {
    unleashedAssemblyNumber?: string;
    unleashed_assembly_number?: string;
    unleashedSalesOrderNumber?: string;
  };
  const hasAny = extra.unleashedAssemblyNumber || extra.unleashed_assembly_number || job.assemblyStatus || job.assemblyCreatedAt;
  const assemblyNumber = extra.unleashedAssemblyNumber ?? extra.unleashed_assembly_number;
  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No linked Unleashed Assembly for this job.
      </div>
    );
  }
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="font-medium text-sm flex items-center gap-2">
        Assembly information
        <Badge variant="secondary">Assembly Linked</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <Detail label="Assembly number" value={assemblyNumber ?? "—"} />
        <Detail label="Status" value={job.assemblyStatus ?? "—"} />
        <Detail label="Created" value={job.assemblyCreatedAt ? fmtDate(job.assemblyCreatedAt) : "—"} />
        <Detail label="Sales order" value={extra.unleashedSalesOrderNumber ?? "—"} />
      </div>
    </div>
  );
}

function AssemblyComponentsTable({ job, stockItems }: { job: Job; stockItems: StockItem[] }) {
  const components = job.assemblyComponents ?? [];
  if (components.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
        No assembly components imported. They will appear here once the linked Unleashed Assembly is created.
      </div>
    );
  }
  const stockBySku = new Map<string, StockItem>();
  for (const item of stockItems) stockBySku.set(item.sku.toLowerCase(), item);

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead className="text-right">Required</TableHead>
            <TableHead className="text-right">On hand</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.map((c, idx) => {
            const stock = stockBySku.get((c.productCode ?? "").toLowerCase());
            const available = stock?.availableStock ?? 0;
            const onHand = stock?.quantityOnHand ?? 0;
            const unit = c.unit ?? stock?.unit ?? "units";
            const shortfall = Math.max(0, c.quantity - available);
            const status: { label: string; tone: string } = !stock
              ? { label: "Not tracked", tone: "border-amber-500/40 text-amber-600 dark:text-amber-400" }
              : shortfall > 0
              ? { label: `Short ${shortfall.toLocaleString()}`, tone: "border-red-500/40 text-red-600 dark:text-red-400" }
              : available < c.quantity * 1.1
              ? { label: "Low", tone: "border-amber-500/40 text-amber-600 dark:text-amber-400" }
              : { label: "OK", tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" };
            return (
              <TableRow key={`${c.productCode}-${idx}`}>
                <TableCell>
                  <div className="font-medium text-sm">{c.name || c.productCode}</div>
                  <div className="text-xs text-muted-foreground">{c.productCode}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.quantity.toLocaleString()} {unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {onHand.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {available.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={status.tone}>
                    {status.label}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

