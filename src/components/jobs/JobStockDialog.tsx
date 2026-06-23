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
import { JobShipmentsBlock } from "./JobShipmentsBlock";
import { cn } from "@/lib/utils";
import { downloadJobPdf, printJobPdf } from "@/lib/job-pdf";
import { useLineSetups } from "@/lib/line-setups";
import { useCustomerSpecs } from "@/lib/customer-specs";
import { CustomerSpecsView } from "@/components/customer-specs/CustomerSpecsView";
import { toast } from "sonner";
import { useStockStore } from "@/lib/stock-store";
import type { StockItem } from "@/lib/stock";
import { refreshJobAssemblyComponents, refreshJobBomComponents } from "@/lib/unleashed/fill-ready.functions";
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

type RefreshAssemblyResult = {
  assemblyComponents?: Job["assemblyComponents"];
  assemblyStatus?: string | null;
  assemblyCreatedAt?: string | null;
  unleashedAssemblyNumber?: string | null;
  unleashedSalesOrderNumber?: string | null;
  quantity?: number;
  cartonsOrdered?: number;
  bottlesPerCarton?: number;
  bottleSize?: string;
};

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

/** Parse "6x1L", "12 × 500ml", "4x4 litre" etc. from a product description. */
function parsePackFromName(desc: string): { perCarton?: number; size?: string } {
  if (!desc) return {};
  const m = desc.toLowerCase().match(
    /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|millilitres?|l|lt|ltr|litres?|liters?|kg|g|grams?)\b/,
  );
  if (!m) return {};
  const count = Number(m[1]);
  const size = Number(m[2]);
  let unit = m[3];
  if (/^(ml|millilitres?)$/.test(unit)) unit = "ml";
  else if (/^(l|lt|ltr|litres?|liters?)$/.test(unit)) unit = "L";
  else if (/^(g|grams?)$/.test(unit)) unit = "g";
  else if (unit === "kg") unit = "kg";
  if (count > 1 && size > 0) return { perCarton: count, size: `${size}${unit}` };
  return {};
}

/** Derive (cartons, bottlesPerCarton) from job, falling back to product-name parsing
 *  when older imports didn't persist these fields. */
function deriveCartons(job: Job): { cartons?: number; perCarton?: number; bottleSize?: string; derived: boolean } {
  if (job.cartonsOrdered && job.bottlesPerCarton && job.bottlesPerCarton > 1) {
    return {
      cartons: job.cartonsOrdered,
      perCarton: job.bottlesPerCarton,
      bottleSize: job.bottleSize,
      derived: false,
    };
  }
  const parsed = parsePackFromName(`${job.product ?? ""} ${job.bottleSize ?? ""}`);
  if (parsed.perCarton && parsed.perCarton > 1) {
    // For boxed products that weren't recognised at import, the stored quantity is
    // the sales-order line quantity (i.e. cartons), not bottles.
    return {
      cartons: job.quantity,
      perCarton: parsed.perCarton,
      bottleSize: parsed.size ?? job.bottleSize,
      derived: true,
    };
  }
  if (job.bottlesPerCarton && job.bottlesPerCarton > 1 && job.quantity > 0) {
    return {
      cartons: Math.ceil(job.quantity / job.bottlesPerCarton),
      perCarton: job.bottlesPerCarton,
      bottleSize: job.bottleSize,
      derived: false,
    };
  }
  return { derived: false };
}


export function JobStockDialog({ job, open, onOpenChange }: Props) {
  const { presets } = useLineSetups();
  const { getSpecForJob } = useCustomerSpecs();
  const { items: stockItems } = useStockStore();
  const { updateJob, lines } = useStore();
  const { can } = useAuth();
  const canEdit = can("jobs:edit") || can("jobs:create");
  const refreshAssembly = useServerFn(refreshJobAssemblyComponents);
  const refreshBom = useServerFn(refreshJobBomComponents);
  const [assemblyPatch, setAssemblyPatch] = useState<(Partial<Job> & { jobId: string }) | null>(null);
  const [bomLoading, setBomLoading] = useState(false);

  useEffect(() => {
    setAssemblyPatch(null);
  }, [job?.id]);

  useEffect(() => {
    const hasComponents = (job?.assemblyComponents?.length ?? 0) > 0 || (assemblyPatch?.assemblyComponents?.length ?? 0) > 0;
    const hasLinkedAssembly = Boolean(job?.unleashedAssemblyNumber || job?.assemblyStatus || (job as unknown as { unleashed_assembly_number?: string } | null)?.unleashed_assembly_number);
    if (!open || !job || hasComponents || assemblyPatch?.jobId === job.id || !job.sku) return;
    const jobId = job.id;
    let cancelled = false;
    // If an Assembly is linked, prefer its lines (planner may have edited them).
    // Otherwise fall back to the product's BOM so stock requirements show before QC.
    const fetcher = hasLinkedAssembly
      ? refreshAssembly({ data: { jobId } })
      : refreshBom({ data: { jobId } });
    fetcher
      .then((result) => {
        if (cancelled) return;
        const refreshed = result as RefreshAssemblyResult;
        setAssemblyPatch({
          jobId,
          assemblyComponents: refreshed.assemblyComponents,
          assemblyStatus: refreshed.assemblyStatus ?? undefined,
          assemblyCreatedAt: refreshed.assemblyCreatedAt ?? undefined,
          unleashedAssemblyNumber: refreshed.unleashedAssemblyNumber ?? undefined,
          unleashedSalesOrderNumber: refreshed.unleashedSalesOrderNumber ?? undefined,
          quantity: refreshed.quantity,
          cartonsOrdered: refreshed.cartonsOrdered,
          bottlesPerCarton: refreshed.bottlesPerCarton,
          bottleSize: refreshed.bottleSize,
        });
      })
      .catch((error) => console.error("[jobs] component refresh failed", error));
    return () => {
      cancelled = true;
    };
  }, [open, job, assemblyPatch, refreshAssembly, refreshBom]);

  const handlePullBom = async () => {
    if (!job?.id) return;
    setBomLoading(true);
    try {
      const result = (await refreshBom({ data: { jobId: job.id } })) as RefreshAssemblyResult;
      setAssemblyPatch({
        jobId: job.id,
        assemblyComponents: result.assemblyComponents,
        cartonsOrdered: result.cartonsOrdered,
        bottlesPerCarton: result.bottlesPerCarton,
      });
      toast.success(`Pulled ${result.assemblyComponents?.length ?? 0} components from Unleashed BOM`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not pull BOM from Unleashed");
    } finally {
      setBomLoading(false);
    }
  };

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
                    const d = deriveCartons(currentJob);
                    if (d.cartons && d.perCarton && d.perCarton > 1) {
                      const pack = d.bottleSize ? `${d.perCarton} × ${d.bottleSize}` : `${d.perCarton} bottles`;
                      const totalBottles = d.derived ? d.cartons * d.perCarton : currentJob.quantity;
                      return (
                        <span>
                          {d.cartons.toLocaleString()} cartons ({pack})
                          <span className="text-muted-foreground"> · {totalBottles.toLocaleString()} bottles</span>
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

            <PalletsBlock job={currentJob} stockItems={stockItems} canEdit={canEdit} updateJob={updateJob} />

            <JobShipmentsBlock
              jobId={currentJob.id}
              totalPallets={currentJob.pallets ?? 0}
              canEdit={canEdit}
            />


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
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Job colour</div>
                <div className="flex flex-wrap items-center gap-2">
                  {["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#ef4444", "#3b82f6", "#64748b"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => void updateJob(currentJob.id, { customerColor: c })}
                      className={`size-6 rounded-full border-2 ${currentJob.customerColor === c ? "border-foreground" : "border-transparent"} disabled:opacity-50`}
                      style={{ backgroundColor: c }}
                      aria-label={`Set colour ${c}`}
                    />
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="color"
                      disabled={!canEdit}
                      value={currentJob.customerColor || "#0ea5e9"}
                      onChange={(e) => void updateJob(currentJob.id, { customerColor: e.target.value })}
                      className="size-6 rounded cursor-pointer bg-transparent border border-border"
                    />
                    Custom
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Calendar label (optional)</div>
                <Input
                  disabled={!canEdit}
                  value={currentJob.calendarLabel ?? ""}
                  placeholder={currentJob.product}
                  onChange={(e) =>
                    void updateJob(currentJob.id, { calendarLabel: e.target.value || undefined })
                  }
                />
                <div className="text-[11px] text-muted-foreground">
                  Overrides only the text shown on the calendar pill. Leave blank to use the product name.
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
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={handlePullBom} disabled={bomLoading || !currentJob.sku}>
                {bomLoading ? "Pulling…" : "Pull from Unleashed BOM"}
              </Button>
            </div>
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

function PalletsBlock({
  job,
  stockItems,
  canEdit,
  updateJob,
}: {
  job: Job;
  stockItems: StockItem[];
  canEdit: boolean;
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>;
}) {
  // Find a linked stock item that has boxesPerPallet set. Prefer the
  // liquid/finished product (matches the sales-order reference), then fall
  // back to carton/bottle/label/cap.
  const linkSkus = [
    job.sku,
    job.liquidSku,
    job.cartonSku,
    job.bottleSku,
    job.labelSku,
    job.capSku,
  ].filter(Boolean) as string[];

  const bySku = new Map<string, StockItem>();
  for (const s of stockItems) bySku.set(s.sku.toLowerCase(), s);
  let sourceItem: StockItem | undefined;
  for (const sku of linkSkus) {
    const it = bySku.get(sku.toLowerCase());
    if (it?.boxesPerPallet && it.boxesPerPallet > 0) {
      sourceItem = it;
      break;
    }
  }

  // Name-based fallback for known products when no linked stock item has
  // boxes-per-pallet configured. Keeps auto-calc working for IPA fills, etc.
  const NAME_FALLBACK_BOXES_PER_PALLET: { match: RegExp; boxes: number; label: string }[] = [
    { match: /\bipa\b|isopropyl/i, boxes: 432, label: "IPA (432 ctn/pallet)" },
  ];
  const haystack = `${job.product ?? ""} ${job.sku ?? ""} ${job.liquidSku ?? ""}`;
  const nameFallback = NAME_FALLBACK_BOXES_PER_PALLET.find((r) => r.match.test(haystack));

  const boxesPerPallet = sourceItem?.boxesPerPallet ?? nameFallback?.boxes;
  const cartons = deriveCartons(job).cartons;

  const suggested =
    boxesPerPallet && boxesPerPallet > 0 && cartons && cartons > 0
      ? Math.ceil(cartons / boxesPerPallet)
      : undefined;

  const fullPallets =
    boxesPerPallet && boxesPerPallet > 0 && cartons && cartons > 0
      ? Math.floor(cartons / boxesPerPallet)
      : undefined;
  const remainder =
    boxesPerPallet && boxesPerPallet > 0 && cartons && cartons > 0
      ? cartons % boxesPerPallet
      : undefined;

  const [value, setValue] = useState<string>(String(job.pallets ?? ""));
  useEffect(() => {
    setValue(String(job.pallets ?? ""));
  }, [job.pallets, job.id]);

  const commit = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === job.pallets) return;
    void updateJob(job.id, { pallets: n });
  };

  const applySuggested = () => {
    if (!suggested) return;
    setValue(String(suggested));
    void updateJob(job.id, { pallets: suggested });
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="font-medium text-sm flex items-center justify-between">
        <span>Pallets</span>
        {!canEdit && <span className="text-xs text-muted-foreground">Read only</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Pallets for this order
          </div>
          <Input
            type="number"
            min={0}
            disabled={!canEdit}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Auto-calculated
          </div>
          <div className="h-10 flex items-center font-medium">
            {suggested !== undefined ? (
              <span>
                {fullPallets ?? 0} full {fullPallets === 1 ? "pallet" : "pallets"}
                {remainder && remainder > 0 && (
                  <span>
                    {" "}+ {remainder} {remainder === 1 ? "box" : "boxes"} on next pallet
                  </span>
                )}
                <span className="text-muted-foreground font-normal"> · {suggested} total</span>
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Source</div>
          <div className="h-10 flex items-center text-xs text-muted-foreground">
            {sourceItem && boxesPerPallet
              ? `${cartons?.toLocaleString() ?? "?"} cartons ÷ ${boxesPerPallet}/pallet (${sourceItem.sku})`
              : nameFallback && boxesPerPallet
              ? `${cartons?.toLocaleString() ?? "?"} cartons ÷ ${boxesPerPallet}/pallet · ${nameFallback.label}`
              : "Set 'Boxes per pallet' on the linked product in Stock to auto-calculate."}
          </div>
        </div>
      </div>
      {suggested !== undefined && suggested !== job.pallets && canEdit && (
        <div>
          <Button variant="outline" size="sm" onClick={applySuggested}>
            Apply suggested ({suggested})
          </Button>
        </div>
      )}
    </div>
  );
}


